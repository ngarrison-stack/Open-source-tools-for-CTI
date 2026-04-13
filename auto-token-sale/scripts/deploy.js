const hre = require("hardhat");

async function main() {
  // ── Configuration ──────────────────────────────────────────────────
  // Set these via environment variables or edit directly before deploying.

  // Known DEX router addresses:
  //   Uniswap V2 (Ethereum):  0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
  //   Uniswap V2 (Base):      0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
  //   BlockDAG native DEX:    TBD (Phase 3 — update once deployed)
  const ROUTER = process.env.DEX_ROUTER_ADDRESS;

  // Known BDAG token addresses:
  //   Ethereum:  0xa5d6aBc273c114EF7071f86C834EE14EA63A1948
  //   Base:      0xdaa7d4ed933a20a2bd6a36c3821ef207f2c38d7d
  //   BlockDAG:  native currency (use wrapped BDAG address when available)
  const TOKEN = process.env.BDAG_TOKEN_ADDRESS;

  // Sell percentage in basis points (4000 = 40%)
  const SELL_BPS = process.env.SELL_BPS || "4000";

  // Max slippage in basis points (500 = 5%)
  const SLIPPAGE_BPS = process.env.SLIPPAGE_BPS || "500";

  if (!ROUTER || !TOKEN) {
    console.error(
      "Error: Set DEX_ROUTER_ADDRESS and BDAG_TOKEN_ADDRESS environment variables.\n\n" +
      "Example:\n" +
      "  DEX_ROUTER_ADDRESS=0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D \\\n" +
      "  BDAG_TOKEN_ADDRESS=0xa5d6aBc273c114EF7071f86C834EE14EA63A1948 \\\n" +
      "  npx hardhat run scripts/deploy.js --network ethereum"
    );
    process.exit(1);
  }

  console.log("Deploying AutoTokenSale...");
  console.log("  Router:      ", ROUTER);
  console.log("  Token:       ", TOKEN);
  console.log("  Sell %:      ", Number(SELL_BPS) / 100 + "%");
  console.log("  Max slippage:", Number(SLIPPAGE_BPS) / 100 + "%");

  const AutoTokenSale = await hre.ethers.getContractFactory("AutoTokenSale");
  const contract = await AutoTokenSale.deploy(
    ROUTER,
    TOKEN,
    Number(SELL_BPS),
    Number(SLIPPAGE_BPS)
  );

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nAutoTokenSale deployed to:", address);
  console.log(
    "\nNext steps:\n" +
    "  1. Set this contract address as your airdrop claim destination.\n" +
    "  2. Once BDAG tokens arrive, call executeSell() to swap 40% for ETH.\n" +
    "  3. Call withdrawETH() to collect your ETH proceeds.\n" +
    "  4. Call withdrawToken(BDAG_ADDRESS) to retrieve the remaining 60% BDAG."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
