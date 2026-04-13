// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Minimal mock of Uniswap V2 Router for unit testing.
 *      Does not perform real swaps — just satisfies interface calls.
 */
contract MockUniswapRouter {
    address public constant WETH_ADDRESS = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    function WETH() external pure returns (address) {
        return WETH_ADDRESS;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata)
        external
        pure
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn / 1000; // Mock: 1 token = 0.001 ETH
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256,
        uint256,
        address[] calldata,
        address,
        uint256
    ) external {
        // No-op in mock — real router would execute the swap
    }
}
