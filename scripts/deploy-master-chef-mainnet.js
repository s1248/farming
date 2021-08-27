// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat');

async function main() {
  const owner = '';
  const treasury = '';
  const buniPerBlock = '8680000000000000000';
  const startBlock = '10389200';
  const buniAddress = "0x0e7beec376099429b85639eb3abe7cf22694ed49";
  const vBuniAddress = '0x7cdb479acd5efc8b8b432670e70665bc8a5b1234';
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  // I. Verify Address
  if (!buniAddress) {
    throw new Error("Please Fill Buni Address")
  }

  if (!treasury) {
    throw new Error("Please Fill Treasury Address")
  }
  
  if (!owner) {
    throw new Error("Please Fill Owner Address")
  }

  if (!vBuniAddress) {
    throw new Error("Please Fill VBuni Address")
  }

  // II. Deploy VBUNI Token
  const VBuniToken = await hre.ethers.getContractFactory('VBuniToken');
  const vBuni = await VBuniToken.attach(vBuniAddress);

  console.log('VBuni attached with address:', vBuni.address);

  // III. Deploy Masterchef
  const MasterChef = await hre.ethers.getContractFactory('MasterChef');
  const masterChef = await MasterChef.deploy(buniAddress, vBuni.address, owner, treasury, buniPerBlock, startBlock);

  await masterChef.deployed();

  console.log('MasterChef deployed to:', masterChef.address);

  // V. Setup Masterchef

  // 1. Transfer Ownership to address
  await Promise.all([
    await vBuni.grantRole('0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6', masterChef.address),
  ]);

  // Verify Contract

  await verifyContract(masterChef.address, [buniAddress, vBuni.address, owner, treasury, buniPerBlock, startBlock]);
  await verifyContract(vBuni.address, []);
}

const verifyContract = async (address, args) => {
  await hre.run("verify:verify", {
    address,
    constructorArguments: args,
  })
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
