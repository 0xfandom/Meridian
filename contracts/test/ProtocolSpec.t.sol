// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice Validates that config/protocol-spec.json is well-formed: exactly one primary chain
///         with a real chain id, a non-empty collateral set, and exactly three adapters that
///         each declare a protocol, a category, and at least one action. Freezes the v1 surface.
contract ProtocolSpecTest is Test {
    using stdJson for string;

    uint256 internal constant EXPECTED_ADAPTERS = 3;

    string internal json;

    function setUp() public {
        json = vm.readFile("config/protocol-spec.json");
    }

    function test_ExactlyOnePrimaryChain() public view {
        string[] memory chains = vm.parseJsonKeys(json, ".chains");
        assertGt(chains.length, 0, "no chains configured");

        uint256 primaries;
        for (uint256 i = 0; i < chains.length; i++) {
            string memory base = string.concat(".chains.", chains[i]);
            assertGt(json.readUint(string.concat(base, ".chainId")), 0, "invalid chain id");
            if (keccak256(bytes(json.readString(string.concat(base, ".role")))) == keccak256(bytes("primary"))) {
                primaries++;
            }
        }
        assertEq(primaries, 1, "there must be exactly one primary chain");
    }

    function test_CollateralSetIsNonEmpty() public view {
        assertGt(json.readStringArray(".collateral").length, 0, "empty collateral set");
    }

    function test_FirstThreeAdaptersAreSpecified() public view {
        string[] memory adapters = vm.parseJsonKeys(json, ".adapters");
        assertEq(adapters.length, EXPECTED_ADAPTERS, "expected exactly three adapters");

        for (uint256 i = 0; i < adapters.length; i++) {
            string memory base = string.concat(".adapters.", adapters[i]);
            assertGt(bytes(json.readString(string.concat(base, ".protocol"))).length, 0, "empty adapter protocol");
            assertGt(bytes(json.readString(string.concat(base, ".category"))).length, 0, "empty adapter category");
            assertGt(json.readStringArray(string.concat(base, ".actions")).length, 0, "adapter has no actions");
        }
    }
}
