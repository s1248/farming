pragma solidity 0.6.12;

import '@pancakeswap/pancake-swap-lib/contracts/math/SafeMath.sol';
import '@pancakeswap/pancake-swap-lib/contracts/token/BEP20/IBEP20.sol';
import '@pancakeswap/pancake-swap-lib/contracts/token/BEP20/SafeBEP20.sol';
import '@pancakeswap/pancake-swap-lib/contracts/access/Ownable.sol';
import './interfaces/IERC721.sol';
import "./BuniToken.sol";


interface IMigratorChef {
    function migrate(IBEP20 token) external returns (IBEP20);
}

// MasterChef is the master of Buni. He can make Buni and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once Buni is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterChef is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 lastDeposit;
        //
        // We do some fancy math here. Basically, any point in time, the amount of Buni
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accBuniPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accBuniPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IBEP20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. Buni to distribute per block.
        uint256 lastRewardBlock;  // Last block number that Buni distribution occurs.
        uint256 accBuniPerShare; // Accumulated Buni per share, times 1e12. See below.
    }

    // The Buni TOKEN!
    BuniToken public buni;
    // ERC721 Vested Token
    IERC721 public vBuni;
    // Dev address.
    address public devaddr;
    // Dev address.
    address public treasury;
    // Buni tokens created per block.
    uint256 public buniPerBlock;
    // Bonus muliplier for early buni makers.
    uint256 public BONUS_MULTIPLIER = 1;
    // Max mint
    uint256 public MAX_MINT = 100000000 * 10 ** 18;
    // Total mint
    uint256 public totalMint = 0;
    // The migrator contract. It has a lot of power. Can only be set through governance (owner).
    IMigratorChef public migrator;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when Buni mining starts.
    uint256 public startBlock;
    // Withdraw fee
    uint256 public platformFeeRate = 0;
    // Withdraw decimals
    uint256 public withdrawDecimals = 3;
    // Vest time lock
    uint256 public vestTimeLock = 30 days;
    // Penalties time lock
    uint256 public penaltyTime = 7 days;
    // Unclaimed buni
    mapping (uint256 => mapping(address => uint256)) unclaimedBuni;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event Vesting(address indexed user, uint256 indexed pid, uint256 amount, uint256 endInvestAt);
    event EmergencyRedeem(address indexed user, uint256 indexed pid, uint256 amount);
    event Redeem(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(
        BuniToken _buni,
        IERC721 _vBuni,
        address _devaddr,
        address _treasury,
        uint256 _buniPerBlock,
        uint256 _startBlock
    ) public {
        buni = _buni;
        vBuni = _vBuni;
        devaddr = _devaddr;
        treasury = _treasury;
        buniPerBlock = _buniPerBlock;
        startBlock = _startBlock;
    }

    function updateMultiplier(uint256 multiplierNumber) public onlyOwner {
        BONUS_MULTIPLIER = multiplierNumber;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, IBEP20 _lpToken, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accBuniPerShare: 0
        }));
    }

    // Update the given pool's Buni allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(_allocPoint);
        }
    }

    // Update the given pool's Buni allocation point. Can only be called by the owner.
    function emergencySet(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(_allocPoint);
        }
    }

    // Set max mint value. Can only be called by the owner.
    function setMaxMint(uint256 _maxMint) public onlyOwner {
        MAX_MINT = _maxMint;
    }

    // Set withdraw penalty value. Can only be called by the owner.
    function setPenaltyFee(uint256 _newPenalty) public onlyOwner {
        require(_newPenalty < 1000, "Overflow Penalty");
        platformFeeRate = _newPenalty;
    }

    // Set the time lock of buni. Can only be called by the owner.
    // User can claim token after expired vest time lock
    function setTimeLock(uint256 _lockedIn) public onlyOwner {
        vestTimeLock = _lockedIn;
    }
    
    // Set the time of penalties. Can only be called by the owner.
    // User can claim token within penalties must paid for the penalty's value
    function setPenaltyTime(uint256 _penaltyIn) public onlyOwner {
        penaltyTime = _penaltyIn;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from).mul(BONUS_MULTIPLIER);
    }

    // View function to see pending Buni on frontend.
    function pendingBuni(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accBuniPerShare = pool.accBuniPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 buniReward = multiplier.mul(buniPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accBuniPerShare = accBuniPerShare.add(buniReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accBuniPerShare).div(1e12).sub(user.rewardDebt).add(unclaimedBuni[_pid][_user]);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update Buni Per Block
    function setBuniPerBlock(uint256 _buniPerBlock) external onlyOwner {
        massUpdatePools();
        buniPerBlock = _buniPerBlock;
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 buniReward = multiplier.mul(buniPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        pool.accBuniPerShare = pool.accBuniPerShare.add(buniReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterChef for Buni allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accBuniPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                unclaimedBuni[_pid][msg.sender] = unclaimedBuni[_pid][msg.sender].add(pending);
            }
        }
        
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }

        user.rewardDebt = user.amount.mul(pool.accBuniPerShare).div(1e12);
        user.lastDeposit = block.timestamp;
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        uint256 withdrawFee = 0;
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");

        harvest(_pid);

        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            user.rewardDebt = user.amount.mul(pool.accBuniPerShare).div(1e12);

            if (block.timestamp < user.lastDeposit.add(penaltyTime)) {
                withdrawFee = getWithdrawFee(_amount);
            }
            uint256 amountExcludeWithdrawFee = _amount.sub(withdrawFee);
            require(withdrawFee < amountExcludeWithdrawFee, "withdraw: fee exceeded");
            pool.lpToken.safeTransfer(address(msg.sender), amountExcludeWithdrawFee);
            if (withdrawFee > 0) {
                pool.lpToken.safeTransfer(address(devaddr), withdrawFee);
            }
        } else {
            user.rewardDebt = user.amount.mul(pool.accBuniPerShare).div(1e12);
        }

        emit Withdraw(msg.sender, _pid, _amount);
    }

    function harvest(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        uint256 unclaimedBuniValue = unclaimedBuni[_pid][msg.sender];
        uint256 pending = user.amount.mul(pool.accBuniPerShare).div(1e12).sub(user.rewardDebt);

        uint256 totalHarvest = pending.add(unclaimedBuniValue);

        user.rewardDebt = user.amount.mul(pool.accBuniPerShare).div(1e12);
        
        if (totalHarvest > 0) {
            unclaimedBuni[_pid][msg.sender] = 0;
            mintVestingBuni(_pid, totalHarvest);
        }

        emit Harvest(msg.sender, _pid, totalHarvest);
    }

    // Update dev address by the previous dev.
    function dev(address _devaddr) public {
        require(msg.sender == devaddr, "dev: wut?");
        devaddr = _devaddr;
    }

    // Update dev address by the previous dev.
    function setTreasury(address _treasury) public onlyOwner {
        treasury = _treasury;
    }

    // Get Withdraw fee
    function getWithdrawFee(uint256 _amount) public view returns(uint256) {
        return _amount.mul(platformFeeRate).div(10 ** withdrawDecimals);
    }

    function emergencyRedeemBuni(uint256 _tokenId) public {
        uint256 pid;
        uint256 amount;
        uint256 vestedAt;
        uint256 createdAt;

        (pid, amount, vestedAt, createdAt) = IERC721(vBuni).getTokenInfo(_tokenId);
        
        uint256 claimAble = amount;
        uint256 burnAmount = 0;

        if (block.timestamp < vestedAt) {
            uint256 vestedIn = vestedAt.sub(createdAt);
            uint256 buniPerSecond = amount.div(vestedIn);
            uint256 currentClaim = block.timestamp.sub(createdAt) * buniPerSecond;

            uint256 penaltyAmount = amount.sub(currentClaim).div(2);
            burnAmount = penaltyAmount;
            claimAble = currentClaim.add(penaltyAmount);
        }

        IERC721(vBuni).transferFrom(msg.sender, address(this), _tokenId);
        IERC721(vBuni).burn(_tokenId);

        require(claimAble <= amount, "withdraw not good");
        buni.mint(msg.sender, claimAble);
        buni.mint(treasury, burnAmount);

        emit EmergencyRedeem(msg.sender, pid, amount);
    }

    function redeemBuni(uint256 _tokenId) public {
        uint256 pid;
        uint256 amount;
        uint256 vestedAt;
        (pid, amount, vestedAt, ) = IERC721(vBuni).getTokenInfo(_tokenId);
        require(block.timestamp >= vestedAt, "token are vesting");
        IERC721(vBuni).transferFrom(msg.sender, address(this), _tokenId);
        IERC721(vBuni).burn(_tokenId);

        Redeem(msg.sender, pid, amount);
        buni.mint(msg.sender, amount);
    }

    function redeemBatchBuni(uint256[] memory _tokenIds) public {
        for (uint16 i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];
            redeemBuni(tokenId);
        }
    }

    function mintVestingBuni(uint256 _pid, uint256 _amount) internal {
        require(totalMint.add(_amount) <= MAX_MINT, "max mint exceeded");

        totalMint = totalMint.add(_amount);

        IERC721(vBuni).mint(msg.sender, _pid, _amount, block.timestamp.add(vestTimeLock));

        emit Vesting(msg.sender, _pid, _amount, block.timestamp.add(vestTimeLock));
    }
}
