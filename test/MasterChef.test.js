const {
  time
} = require('@openzeppelin/test-helpers');
const {
  expect
} = require('chai');

describe('MasterChef', () => {
  let owner, user1, user2;

  let lp1, lp2;
  let masterChef;
  let buni, vBuni;
  beforeEach(async () => {
    const buniPerBlock = '100000000000000';
    const startBlock = 0;

    [owner, user1, user2] = await ethers.getSigners();

    // We get the contract to deploy

    // I. Deploy BUNI & vBUNI Token

    // BUNI
    const BuniToken = await hre.ethers.getContractFactory('BuniToken');
    buni = await BuniToken.deploy();

    await buni.deployed();

    // vBUNI
    const VBuniToken = await hre.ethers.getContractFactory('VBuniToken');
    vBuni = await VBuniToken.deploy();
  
    await vBuni.deployed();

    // II. Deploy Masterchef
    const MasterChef = await hre.ethers.getContractFactory('MasterChef');
    masterChef = await MasterChef.deploy(buni.address, vBuni.address, owner.address, owner.address, buniPerBlock, startBlock);

    await masterChef.deployed();

    // III. Deploy test LP
    const MockBEP20 = await hre.ethers.getContractFactory('MockBEP20');
    lp1 = await MockBEP20.deploy('Buni LPs', 'Buni-LP', ethers.utils.parseUnits('10000000', 18));

    await lp1.deployed();

    lp2 = await MockBEP20.deploy('Buni-2 LPs', 'Buni2-LP', ethers.utils.parseUnits('10000000', 18));

    await lp2.deployed();

    // IV. Setup Masterchef

    // 1. Transfer Ownership to address
    await Promise.all([
      await buni.addMinter(masterChef.address),
      await masterChef.setTimeLock(100),
      await vBuni.grantRole('0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6', masterChef.address),
    ]);

    // 2. Transfer LP tokens
    await Promise.all([
      lp1.transfer(user1.address, ethers.utils.parseUnits('10000', 18)),
      lp1.transfer(user2.address, ethers.utils.parseUnits('10000', 18)),

      lp2.transfer(user1.address, ethers.utils.parseUnits('10000', 18)),
      lp2.transfer(user2.address, ethers.utils.parseUnits('10000', 18)),
    ]);

  });

  it('can add pool', async () => {
    await masterChef.add('1000', lp1.address, true);
    await masterChef.add('1000', lp2.address, true);
    await masterChef.add('1000', lp1.address, true);
    await masterChef.add('1000', lp2.address, true);

    expect(await masterChef.poolLength()).to.equal(4);
  })

  it('real case', async () => {
    await masterChef.add('1000', lp1.address, true);
    await masterChef.add('1000', lp2.address, true);

    expect(await masterChef.poolLength()).to.equal(2);

    await lp1.connect(user1).approve(masterChef.address, ethers.utils.parseUnits('1000000', 18));

    expect(await buni.balanceOf(user1.address)).to.equal(0);

    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('10000', 18));
    await masterChef.setTimeLock(0);
    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('10000', 18));

    const vBuniBalance = await vBuni.balanceOf(user1.address);
    
    expect(vBuniBalance).to.equal(1);

    await vBuni.connect(user1).setApprovalForAll(masterChef.address, true);

    const balance = await buni.balanceOf(user1.address);
    await masterChef.connect(user1).redeemBuni(0);

    const afterRedeemBalance = await buni.balanceOf(user1.address);

    expect(afterRedeemBalance).to.gt(balance);
  })

  it('Withdraw claim all harvest', async () => {
    await masterChef.add('1000', lp1.address, true);
    await masterChef.add('1000', lp2.address, true);

    expect(await masterChef.poolLength()).to.equal(2);

    await lp1.connect(user1).approve(masterChef.address, ethers.utils.parseUnits('10000000', 18));

    expect(await buni.balanceOf(user1.address)).to.equal(0);

    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('100', 18));
    await masterChef.setTimeLock(0);
    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('100', 18));
    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('100', 18));
    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('100', 18));
    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('100', 18));
    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('100', 18));

    const vBuniBalance = await vBuni.balanceOf(user1.address);
    const pending = await masterChef.pendingBuni(0, user1.address);

    expect(pending).to.be.equal(0);
    expect(vBuniBalance).to.equal(2);

    await vBuni.connect(user1).setApprovalForAll(masterChef.address, true);

    const balance = await buni.balanceOf(user1.address);
    await masterChef.connect(user1).redeemBuni(0);

    const afterRedeemBalance = await buni.balanceOf(user1.address);

    expect(afterRedeemBalance).to.gt(balance);
  })


  it('deposit/withdraw', async () => {
    await masterChef.add('1000', lp1.address, true);

    await lp1.connect(user1).approve(masterChef.address, ethers.utils.parseUnits('1000000', 18));
    await lp1.connect(user2).approve(masterChef.address, ethers.utils.parseUnits('1000000', 18));

    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('2000', 18));
    await masterChef.connect(user1).deposit(0, 0);
    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('4000', 18));
    await masterChef.connect(user1).deposit(0, '0');

    expect(await lp1.balanceOf(user1.address)).to.equal(ethers.utils.parseUnits('4000', 18));

    await masterChef.setTimeLock(0);
    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('1000', 18));
    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('1000', 18));
    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('8000', 18));

    await masterChef.connect(user2).deposit(0, ethers.utils.parseUnits('1000', 18));
    await masterChef.connect(user2).deposit(0, ethers.utils.parseUnits('1000', 18));
    await masterChef.connect(user2).withdraw(0, ethers.utils.parseUnits('2000', 18));

    const vBuniBalance = await vBuni.balanceOf(user1.address);
    const vBuniBalance2 = await vBuni.balanceOf(user2.address);

    expect(vBuniBalance).to.equal(1);
    expect(vBuniBalance2).to.equal(1);

    await vBuni.connect(user1).setApprovalForAll(masterChef.address, true);
    await vBuni.connect(user2).setApprovalForAll(masterChef.address, true);

    await masterChef.connect(user1).redeemBuni(0);
    await masterChef.connect(user2).redeemBuni(1);
    
    expect(await buni.balanceOf(user1.address)).to.gt(0);
    expect(await buni.balanceOf(user2.address)).to.gt(0);
  })


  it('should allow dev and only dev to update dev', async () => {
    expect((await masterChef.devaddr())).to.equal(owner.address);

    await expect(masterChef.connect(user1).dev(user1.address)).to.be.reverted;

    await masterChef.dev(user1.address);
    expect(await masterChef.devaddr()).to.equal(user1.address)
  })

  it('should update multiplier', async () => {
    await masterChef.updateMultiplier(2);
    expect(await masterChef.BONUS_MULTIPLIER()).to.equal(2);
  })

  it('should return correct pool info', async () => {
    await masterChef.add('1000', lp1.address, true);
    await masterChef.add('1000', lp2.address, true);

    expect(await masterChef.poolLength()).to.equal(2);

    const pool1Info = await masterChef.poolInfo(0);
    const pool2Info = await masterChef.poolInfo(1);

    expect(pool1Info.lpToken).to.equal(lp1.address);

    expect(pool2Info.lpToken).to.equal(lp2.address);
  })

  it('should return correct invest info', async () => {
    await masterChef.add('1000', lp1.address, true);

    expect(await masterChef.poolLength()).to.equal(1);

    await lp1.connect(user1).approve(masterChef.address, ethers.utils.parseUnits('1000000', 18));

    expect(await buni.balanceOf(user1.address)).to.equal(0);

    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('10000', 18));
    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('10000', 18));

    const tokenInfo = await vBuni.connect(user1).getTokenInfo(0);

    expect(tokenInfo.length).to.equal(4);
    expect(tokenInfo[0]).to.equal(0);
    expect(tokenInfo[1]).to.gt(0);
    expect(tokenInfo[2]).to.gt(0);
  })

  it('should return correct withdraw fee', async () => {
    const withdrawFee = await masterChef.getWithdrawFee(1000000);

    expect(withdrawFee).to.equal(0);
  })

  it('should return correct value when mint', async () => {
    const buniPerBlock = '8680000000000000000';
    const startBlock = 0;

    [owner, user1, user2] = await ethers.getSigners();

    // We get the contract to deploy

    // I. Deploy BUNI & vBUNI Token

    // BUNI
    const BuniToken = await hre.ethers.getContractFactory('BuniToken');
    buni = await BuniToken.deploy();

    await buni.deployed();

    // vBUNI
    const VBuniToken = await hre.ethers.getContractFactory('VBuniToken');
    const vBuni = await VBuniToken.deploy();
  
    await vBuni.deployed();

    // II. Deploy Masterchef
    const MasterChef = await hre.ethers.getContractFactory('MasterChef');
    const masterChef = await MasterChef.deploy(buni.address, vBuni.address, owner.address, owner.address, buniPerBlock, startBlock);

    await masterChef.deployed();

    // III. Deploy test LP
    const MockBEP20 = await hre.ethers.getContractFactory('MockBEP20');
    const lp1 = await MockBEP20.deploy('Buni LPs', 'Buni-LP', ethers.utils.parseUnits('10000000', 18));
    const lp2 = await MockBEP20.deploy('Buni LPs', 'Buni-LP', ethers.utils.parseUnits('10000000', 18));

    await lp1.deployed();
    await lp2.deployed();

    // IV. Setup Masterchef

    // 1. Transfer Ownership to address
    await Promise.all([
      await buni.addMinter(masterChef.address),
      await masterChef.setTimeLock(0),
      await vBuni.grantRole('0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6', masterChef.address),
    ]);

    // 2. Transfer LP tokens
    await Promise.all([
      lp1.transfer(user1.address, ethers.utils.parseUnits('10000', 18)),
      lp2.transfer(user1.address, ethers.utils.parseUnits('10000', 18)),
    ]);
    await masterChef.setTimeLock(0);
    await masterChef.add('50', lp1.address, true);
    await masterChef.add('100', lp2.address, true);

    await lp1.connect(user1).approve(masterChef.address, ethers.utils.parseUnits('1000000', 18));
    await lp2.connect(user1).approve(masterChef.address, ethers.utils.parseUnits('1000000', 18));

    await masterChef.connect(user1).deposit(0, ethers.utils.parseUnits('100', 18));
    await masterChef.connect(user1).deposit(1, ethers.utils.parseUnits('100', 18));

    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('1', 18));
  
    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('1', 18));

    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('1', 18));

    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('1', 18));

    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('1', 18));

    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('1', 18));

    await masterChef.connect(user1).withdraw(0, ethers.utils.parseUnits('1', 18));

    await vBuni.connect(user1).setApprovalForAll(masterChef.address, true);

    await masterChef.connect(user1).redeemBatchBuni([0, 1, 2, 3, 4, 5, 6]);
  })
});
