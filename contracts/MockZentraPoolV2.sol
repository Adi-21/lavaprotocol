// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

// Minimal pool: tracks WcBTC collateral and lends USDC with simple accounting.
contract MockZentraPoolV2 {
    IERC20 public immutable collateral; // WcBTC (8d)
    IERC20 public immutable usdc;      // USDC (6d)

    mapping(address => uint256) public collateralOf; // in WcBTC
    mapping(address => uint256) public usdcDebtOf;   // in USDC

    constructor(address _collateral, address _usdc) {
        collateral = IERC20(_collateral);
        usdc = IERC20(_usdc);
    }

    function supply(address _asset, uint256 _amount, address _onBehalfOf, uint16) external {
        require(_asset == address(collateral), "bad asset");
        collateral.transferFrom(msg.sender, address(this), _amount);
        collateralOf[_onBehalfOf] += _amount;
    }

    function withdraw(address _asset, uint256 _amount, address _to) external returns (uint256) {
        require(_asset == address(collateral), "bad asset");
        require(collateralOf[msg.sender] >= _amount, "insufficient");
        collateralOf[msg.sender] -= _amount;
        collateral.transfer(_to, _amount);
        return _amount;
    }

    function borrow(address _asset, uint256 _amount, uint256, uint16, address) external {
        require(_asset == address(usdc), "bad asset");
        require(usdc.balanceOf(address(this)) >= _amount, "no liquidity");
        usdcDebtOf[msg.sender] += _amount;
        usdc.transfer(msg.sender, _amount);
    }

    function repay(address _asset, uint256 _amount, uint256, address) external returns (uint256) {
        require(_asset == address(usdc), "bad asset");
        uint256 debt = usdcDebtOf[msg.sender];
        if (_amount > debt) _amount = debt;
        if (_amount == 0) return 0;
        usdc.transferFrom(msg.sender, address(this), _amount);
        usdcDebtOf[msg.sender] -= _amount;
        return _amount;
    }
}


