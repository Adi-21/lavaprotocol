// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// This is a simplified "Mock" of the Zentra Lending Pool for hackathon testing.
// It allows our vault to deposit and withdraw assets.

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IZToken is IERC20 {}

contract MockZentraPool {
    IERC20 public immutable asset;
    IZToken public immutable zToken;

    // We keep track of deposits in a simple mapping.
    mapping(address => uint256) public suppliedAssets;

    constructor(address _asset, address _zToken) {
        asset = IERC20(_asset);
        zToken = IZToken(_zToken);
    }

    // This simulates supplying assets to Zentra.
    function supply(address _asset, uint256 _amount, address _onBehalfOf, uint16) external {
        require(_asset == address(asset), "Unsupported asset");
        asset.transferFrom(msg.sender, address(this), _amount);
        // In a real pool, you'd get zTokens. Here we just track the balance.
        suppliedAssets[_onBehalfOf] += _amount;
    }

    // This simulates withdrawing assets.
    function withdraw(address _asset, uint256 _amount, address _to) external returns (uint256) {
        require(_asset == address(asset), "Unsupported asset");
        require(suppliedAssets[msg.sender] >= _amount, "Insufficient balance");
        suppliedAssets[msg.sender] -= _amount;
        asset.transfer(_to, _amount);
        return _amount;
    }
    
    // Our vault's constructor needs this function to exist. We can return dummy data.
    function getReserveData(address) external view returns (uint256,uint128,uint128,uint128,uint128,uint128,uint40,address,address,address,address,uint8) {
        return (0,0,0,0,0,0,0,address(zToken),address(0),address(0),address(0),0);
    }
}
