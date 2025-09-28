// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

interface IERC20 { function transferFrom(address,address,uint256) external returns(bool); function transfer(address,uint256) external returns(bool); function approve(address,uint256) external returns(bool); function balanceOf(address) external view returns(uint256); }
interface IZentraPoolV2 {
    function supply(address asset, uint256 amount, address onBehalf, uint16) external;
    function withdraw(address asset, uint256 amount, address to) external returns(uint256);
}

contract ZentraAdapter is IStrategy, Ownable {
    address public immutable override vault;
    address public immutable override underlying; // WcBTC
    IZentraPoolV2 public immutable pool;
    uint256 public investedBalance;

    constructor(address _vault, address _underlying, address _pool) Ownable(_vault) {
        vault = _vault;
        underlying = _underlying;
        pool = IZentraPoolV2(_pool);
        IERC20(_underlying).approve(_pool, type(uint256).max);
    }

    function totalAssets() external view override returns (uint256) { return investedBalance; }

    function invest(uint256 amountWcBTC) external override {
        require(msg.sender == vault, "only vault");
        if (amountWcBTC == 0) return;
        // Tokens are already transferred from the vault to this adapter
        pool.supply(underlying, amountWcBTC, address(this), 0);
        investedBalance += amountWcBTC;
    }

    function divest(uint256 amountWcBTC) external override returns (uint256 withdrawn) {
        require(msg.sender == vault, "only vault");
        if (amountWcBTC == 0) return 0;
        withdrawn = pool.withdraw(underlying, amountWcBTC, address(this));
        if (withdrawn > 0) {
            if (withdrawn > investedBalance) investedBalance = 0; else investedBalance -= withdrawn;
            IERC20(underlying).transfer(vault, withdrawn);
        }
    }
}


