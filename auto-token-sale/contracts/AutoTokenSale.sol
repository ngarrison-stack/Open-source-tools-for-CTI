// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AutoTokenSale
 * @notice Proxy contract that receives BDAG (or any ERC-20) airdrop tokens and
 *         auto-sells a configurable percentage via a Uniswap V2-compatible DEX router.
 *
 * Workflow:
 *   1. Deploy this contract, passing the DEX router, token address, and sell percentage.
 *   2. Use this contract's address as the airdrop claim/receiving address.
 *   3. Once tokens arrive, call `executeSell()` — manually, via Chainlink Automation,
 *      or via Gelato to swap the configured percentage for WETH/native currency.
 *   4. Withdraw proceeds with `withdrawETH()` / `withdrawToken()`.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IUniswapV2Router02 {
    function WETH() external pure returns (address);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

contract AutoTokenSale {
    // ── State ───────────────────────────────────────────────────────────

    address public immutable owner;
    IUniswapV2Router02 public dexRouter;
    IERC20 public token;          // BDAG (or any ERC-20 to auto-sell)
    uint256 public sellBps;       // Basis points to sell (4000 = 40%)
    uint256 public slippageBps;   // Max slippage in basis points (default 500 = 5%)

    bool private _locked;         // Reentrancy guard

    // ── Events ──────────────────────────────────────────────────────────

    event SellExecuted(uint256 tokensSold, uint256 ethReceived);
    event ConfigUpdated(address indexed router, address indexed token, uint256 sellBps, uint256 slippageBps);
    event ETHWithdrawn(address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed tokenAddr, address indexed to, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────────

    error OnlyOwner();
    error InvalidBps();
    error NoTokensToSell();
    error TransferFailed();
    error Reentrancy();
    error ZeroAddress();

    // ── Modifiers ───────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    // ── Constructor ─────────────────────────────────────────────────────

    /**
     * @param _router  Uniswap V2-compatible router address
     * @param _token   ERC-20 token to auto-sell (e.g. BDAG)
     * @param _sellBps Percentage to sell in basis points (4000 = 40%)
     * @param _slippageBps Max slippage in basis points (500 = 5%)
     */
    constructor(
        address _router,
        address _token,
        uint256 _sellBps,
        uint256 _slippageBps
    ) {
        if (_router == address(0) || _token == address(0)) revert ZeroAddress();
        if (_sellBps == 0 || _sellBps > 10_000) revert InvalidBps();
        if (_slippageBps > 5_000) revert InvalidBps();

        owner = msg.sender;
        dexRouter = IUniswapV2Router02(_router);
        token = IERC20(_token);
        sellBps = _sellBps;
        slippageBps = _slippageBps;
    }

    // ── Core: Auto-Sell ─────────────────────────────────────────────────

    /**
     * @notice Sells `sellBps` basis points of the contract's token balance
     *         through the DEX router for ETH/native currency.
     * @dev    Can be called by owner directly, or by Chainlink Automation /
     *         Gelato keepers when a balance is detected.
     */
    function executeSell() external onlyOwner nonReentrant {
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) revert NoTokensToSell();

        uint256 amountToSell = (balance * sellBps) / 10_000;
        if (amountToSell == 0) revert NoTokensToSell();

        // Approve router to spend tokens
        token.approve(address(dexRouter), amountToSell);

        // Build swap path: TOKEN → WETH
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = dexRouter.WETH();

        // Calculate minimum output with slippage protection
        uint256[] memory expectedAmounts = dexRouter.getAmountsOut(amountToSell, path);
        uint256 amountOutMin = (expectedAmounts[1] * (10_000 - slippageBps)) / 10_000;

        uint256 ethBefore = address(this).balance;

        // Execute swap
        dexRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountToSell,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 300 // 5-minute deadline
        );

        uint256 ethReceived = address(this).balance - ethBefore;
        emit SellExecuted(amountToSell, ethReceived);
    }

    // ── Chainlink Automation Compatible ─────────────────────────────────

    /**
     * @notice Chainlink Automation check — returns true when the contract
     *         holds tokens that can be sold.
     */
    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 balance = token.balanceOf(address(this));
        uint256 amountToSell = (balance * sellBps) / 10_000;
        upkeepNeeded = amountToSell > 0;
        performData = "";
    }

    /**
     * @notice Called by Chainlink Automation when checkUpkeep returns true.
     * @dev    For Chainlink Automation, you must register this contract as an
     *         upkeep and grant the Automation registry as an allowed caller,
     *         or remove the onlyOwner modifier on executeSell() and add a
     *         keeper whitelist instead.
     */
    function performUpkeep(bytes calldata) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        uint256 amountToSell = (balance * sellBps) / 10_000;
        if (amountToSell == 0) revert NoTokensToSell();

        // Re-use executeSell logic inline to avoid external call to self
        token.approve(address(dexRouter), amountToSell);

        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = dexRouter.WETH();

        uint256[] memory expectedAmounts = dexRouter.getAmountsOut(amountToSell, path);
        uint256 amountOutMin = (expectedAmounts[1] * (10_000 - slippageBps)) / 10_000;

        uint256 ethBefore = address(this).balance;

        dexRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountToSell,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 300
        );

        uint256 ethReceived = address(this).balance - ethBefore;
        emit SellExecuted(amountToSell, ethReceived);
    }

    // ── Owner: Configuration ────────────────────────────────────────────

    /**
     * @notice Update DEX router, token, sell percentage, or slippage.
     */
    function updateConfig(
        address _router,
        address _token,
        uint256 _sellBps,
        uint256 _slippageBps
    ) external onlyOwner {
        if (_router == address(0) || _token == address(0)) revert ZeroAddress();
        if (_sellBps == 0 || _sellBps > 10_000) revert InvalidBps();
        if (_slippageBps > 5_000) revert InvalidBps();

        dexRouter = IUniswapV2Router02(_router);
        token = IERC20(_token);
        sellBps = _sellBps;
        slippageBps = _slippageBps;

        emit ConfigUpdated(_router, _token, _sellBps, _slippageBps);
    }

    // ── Owner: Withdrawals ──────────────────────────────────────────────

    /**
     * @notice Withdraw all ETH/native currency proceeds to the owner.
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool ok, ) = payable(owner).call{value: balance}("");
        if (!ok) revert TransferFailed();
        emit ETHWithdrawn(owner, balance);
    }

    /**
     * @notice Withdraw any ERC-20 token held by this contract.
     * @param _token Address of the token to withdraw.
     */
    function withdrawToken(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        bool ok = IERC20(_token).transfer(owner, balance);
        if (!ok) revert TransferFailed();
        emit TokenWithdrawn(_token, owner, balance);
    }

    // ── Receive ETH from router swap ────────────────────────────────────

    receive() external payable {}
}
