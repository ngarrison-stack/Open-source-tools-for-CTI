const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AutoTokenSale", function () {
  let owner, other;
  let mockRouter, mockToken, autoSale;

  // Minimal mock ERC-20 with balanceOf / approve / transfer
  const MOCK_TOKEN_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address, uint256) returns (bool)",
    "function transfer(address, uint256) returns (bool)",
  ];

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy mock token (simple ERC-20)
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockToken = await MockToken.deploy("BlockDAG", "BDAG", ethers.parseEther("1000000"));
    await mockToken.waitForDeployment();

    // Deploy mock router
    const MockRouter = await ethers.getContractFactory("MockUniswapRouter");
    mockRouter = await MockRouter.deploy();
    await mockRouter.waitForDeployment();

    // Deploy AutoTokenSale: 40% sell, 5% slippage
    const AutoTokenSale = await ethers.getContractFactory("AutoTokenSale");
    autoSale = await AutoTokenSale.deploy(
      await mockRouter.getAddress(),
      await mockToken.getAddress(),
      4000,  // 40%
      500    // 5%
    );
    await autoSale.waitForDeployment();
  });

  describe("Deployment", function () {
    it("sets correct owner", async function () {
      expect(await autoSale.owner()).to.equal(owner.address);
    });

    it("sets correct sell percentage", async function () {
      expect(await autoSale.sellBps()).to.equal(4000);
    });

    it("sets correct slippage", async function () {
      expect(await autoSale.slippageBps()).to.equal(500);
    });

    it("reverts on zero address router", async function () {
      const AutoTokenSale = await ethers.getContractFactory("AutoTokenSale");
      await expect(
        AutoTokenSale.deploy(ethers.ZeroAddress, await mockToken.getAddress(), 4000, 500)
      ).to.be.revertedWithCustomError(autoSale, "ZeroAddress");
    });

    it("reverts on zero address token", async function () {
      const AutoTokenSale = await ethers.getContractFactory("AutoTokenSale");
      await expect(
        AutoTokenSale.deploy(await mockRouter.getAddress(), ethers.ZeroAddress, 4000, 500)
      ).to.be.revertedWithCustomError(autoSale, "ZeroAddress");
    });

    it("reverts on invalid sellBps (0)", async function () {
      const AutoTokenSale = await ethers.getContractFactory("AutoTokenSale");
      await expect(
        AutoTokenSale.deploy(await mockRouter.getAddress(), await mockToken.getAddress(), 0, 500)
      ).to.be.revertedWithCustomError(autoSale, "InvalidBps");
    });

    it("reverts on invalid sellBps (>10000)", async function () {
      const AutoTokenSale = await ethers.getContractFactory("AutoTokenSale");
      await expect(
        AutoTokenSale.deploy(await mockRouter.getAddress(), await mockToken.getAddress(), 10001, 500)
      ).to.be.revertedWithCustomError(autoSale, "InvalidBps");
    });
  });

  describe("Access control", function () {
    it("executeSell reverts for non-owner", async function () {
      await expect(
        autoSale.connect(other).executeSell()
      ).to.be.revertedWithCustomError(autoSale, "OnlyOwner");
    });

    it("updateConfig reverts for non-owner", async function () {
      await expect(
        autoSale.connect(other).updateConfig(
          await mockRouter.getAddress(),
          await mockToken.getAddress(),
          5000,
          500
        )
      ).to.be.revertedWithCustomError(autoSale, "OnlyOwner");
    });

    it("withdrawETH reverts for non-owner", async function () {
      await expect(
        autoSale.connect(other).withdrawETH()
      ).to.be.revertedWithCustomError(autoSale, "OnlyOwner");
    });

    it("withdrawToken reverts for non-owner", async function () {
      await expect(
        autoSale.connect(other).withdrawToken(await mockToken.getAddress())
      ).to.be.revertedWithCustomError(autoSale, "OnlyOwner");
    });
  });

  describe("executeSell", function () {
    it("reverts when no tokens held", async function () {
      await expect(autoSale.executeSell()).to.be.revertedWithCustomError(
        autoSale,
        "NoTokensToSell"
      );
    });
  });

  describe("checkUpkeep", function () {
    it("returns false when no tokens", async function () {
      const [upkeepNeeded] = await autoSale.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });

    it("returns true when tokens are present", async function () {
      // Send tokens to the contract
      await mockToken.transfer(await autoSale.getAddress(), ethers.parseEther("1000"));
      const [upkeepNeeded] = await autoSale.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(true);
    });
  });

  describe("updateConfig", function () {
    it("owner can update config", async function () {
      await autoSale.updateConfig(
        await mockRouter.getAddress(),
        await mockToken.getAddress(),
        6000,
        300
      );
      expect(await autoSale.sellBps()).to.equal(6000);
      expect(await autoSale.slippageBps()).to.equal(300);
    });
  });

  describe("withdrawToken", function () {
    it("withdraws tokens to owner", async function () {
      const amount = ethers.parseEther("1000");
      await mockToken.transfer(await autoSale.getAddress(), amount);

      const balBefore = await mockToken.balanceOf(owner.address);
      await autoSale.withdrawToken(await mockToken.getAddress());
      const balAfter = await mockToken.balanceOf(owner.address);

      expect(balAfter - balBefore).to.equal(amount);
    });
  });
});
