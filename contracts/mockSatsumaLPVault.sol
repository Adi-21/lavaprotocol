// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// This is a simplified "Mock" of the Satsuma LP Vault for hackathon testing.

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract MockSatsumaLPVault {
    IERC20 public immutable asset;

    constructor(address _asset) {
        asset = IERC20(_asset);
    }

    // The total value is simply the WcBTC this contract holds.
    function totalAssets() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function deposit(uint256 _amount, address) external returns (uint256) {
        asset.transferFrom(msg.sender, address(this), _amount);
        return _amount; // In a real vault, this would be shares.
    }

    function withdraw(uint256 _amount, address _receiver, address) external returns (uint256) {
        asset.transfer(_receiver, _amount);
        return _amount;
    }
}
