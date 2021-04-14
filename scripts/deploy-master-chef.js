// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat');
const {
  ethers
} = hre;

async function main() {
  const owner = '0xba535ade958703Ffb99B9325ca8db04A00937029';
  const buniPerBlock = '40000000000000000000';
  const startBlock = 700000;
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  // I. Deploy BUNI Token
  const BuniToken = await hre.ethers.getContractFactory('BuniToken');
  const buni = await BuniToken.deploy();

  await buni.deployed();

  console.log('Buni Token deployed to:', buni.address);

  // II. Deploy VBUNI Token
  const VBuniToken = await hre.ethers.getContractFactory('VBuniToken');
  const vBuni = await VBuniToken.deploy();

  await vBuni.deployed();

  console.log('VBuni Token deployed to:', vBuni.address);

  // III. Deploy Masterchef
  const MasterChef = await hre.ethers.getContractFactory('MasterChef');
  const masterChef = await MasterChef.deploy(buni.address, vBuni.address, owner, buniPerBlock, startBlock);

  await masterChef.deployed();

  console.log('MasterChef deployed to:', masterChef.address);

  // IV. Deploy test LP
  const MockBEP20 = await hre.ethers.getContractFactory('MockBEP20');
  const mockBEP20 = await MockBEP20.deploy('Buni LPs', 'Buni-LP', ethers.utils.parseUnits('10000000', 18));

  await mockBEP20.deployed();

  console.log('MockBEP20 deployed to:', mockBEP20.address);

  // V. Setup Masterchef

  // 1. Transfer Ownership to address
  await Promise.all([
    await buni.transferOwnership(masterChef.address),
    await vBuni.grantRole('0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6', masterChef.address),
  ]);

  // 2. Transfer LP tokens
  await Promise.all([
    mockBEP20.transfer(owner, ethers.utils.parseUnits('100000', 18))
  ]);

  // Verify Contract

  await verifyContract(masterChef.address, [buni.address, vBuni.address, owner, buniPerBlock, startBlock]);
  await verifyContract(vBuni.address, []);
  await verifyContract(mockBEP20.address, ['Buni LPs', 'Buni-LP', ethers.utils.parseUnits('10000000', 18)]);
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