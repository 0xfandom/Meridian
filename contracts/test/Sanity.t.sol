// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Sanity} from "../src/Sanity.sol";

contract SanityTest is Test {
    function test_OzMax() public pure {
        assertEq(Sanity.ozMax(3, 7), 7);
        assertEq(Sanity.ozMax(7, 3), 7);
    }

    function test_SoladyMulWad() public pure {
        assertEq(Sanity.soladyMulWad(2e18, 3e18), 6e18);
    }

    function testFuzz_OzMaxIsCommutative(uint256 a, uint256 b) public pure {
        assertEq(Sanity.ozMax(a, b), Sanity.ozMax(b, a));
    }
}
