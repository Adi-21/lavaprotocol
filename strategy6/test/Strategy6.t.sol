// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {MockWcBTC} from "../../contracts/MockWcBTC.sol";
import {MockUSDC} from "../../contracts/MockUSDC.sol";
import {MockZentraPoolV2} from "../../contracts/MockZentraPoolV2.sol";
import {MockInstitutionalYieldSource} from "../../contracts/MockInstitutionalYieldSource.sol";
import {MockBridge} from "../../contracts/MockBridge.sol";
import {LavaCrossChainVault} from "../../contracts/LavaCrossChainVault.sol";

interface IERC20 { function balanceOf(address) external view returns (uint256); }

contract Strategy6Test is Test {
    MockWcBTC wc;
    MockUSDC usdc;
    MockZentraPoolV2 pool;
    MockInstitutionalYieldSource ys;
    MockBridge bridge;
    LavaCrossChainVault vault;

    address user = address(0xBEEF);

    function setUp() public {
        wc = new MockWcBTC();
        usdc = new MockUSDC();
        pool = new MockZentraPoolV2(address(wc), address(usdc));
        ys = new MockInstitutionalYieldSource(address(this));
        bridge = new MockBridge(address(this));
        bridge.setYieldSource(address(ys));
        // Make bridge the owner of yield source, then vault the owner of bridge
        ys.transferOwnership(address(bridge));
        // Seed pool with USDC liquidity
        usdc.mint(address(pool), 1_000_000e6);
        vault = new LavaCrossChainVault(wc, usdc, pool, bridge, ys);
        bridge.transferOwnership(address(vault));
        // Fund user with native
        vm.deal(user, 1e8); // 1 WcBTC unit of native
    }

    function test_Deposit_And_Harvest_Profit_IncreasesNAV() public {
        vm.startPrank(user);
        vault.deposit{value: 1e4}(user); // deposit 0.0001 cBTC -> wraps to WcBTC and borrows ~20%
        vm.stopPrank();

        uint256 beforeAssets = vault.totalAssets();
        assertGt(beforeAssets, 0, "NAV should be > 0 after deposit");

        // Simulate off-chain profit: mint USDC to the yield source and call accrue via owner (vault)
        // Since ys is owned by vault, we simulate the vault owning USDC by minting to vault and forwarding accrue via prank
        usdc.mint(address(ys), 250e6); // directly increase totalAssets on ys by 250 USDC

        // Owner calls harvest on vault
        vm.prank(vault.owner());
        vault.harvestCrossChainYield();

        uint256 afterAssets = vault.totalAssets();
        assertGt(afterAssets, beforeAssets, "NAV should increase after harvest");
    }
}


