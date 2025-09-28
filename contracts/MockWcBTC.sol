// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Minimal wrapped cBTC mock with 8 decimals, deposit/withdraw and owner mint for tests
contract MockWcBTC is ERC20, Ownable {
    constructor() ERC20("Wrapped cBTC", "WcBTC") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) { return 8; }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "send failed");
    }

    function mintTo(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}


