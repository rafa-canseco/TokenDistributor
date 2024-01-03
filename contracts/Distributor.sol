// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from  "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDistributor {
    function setDistributionCriteria(uint256 minPeriod) external;
    function setShare(address shareholder, uint256 amount) external;
    function deposit(uint256 amount) external;
    function process(uint256 gas) external;
}

contract Distributor is IDistributor {

    struct Share{
        uint256 amount;
        uint256 totalExcluded;
        uint256 totalRealised;
    }

    //State Variables
    address owner;

    address public reflectionToken;

    address[] public shareholders;

    uint256 public totalShares;
    uint256 public totalDividends;
    uint256 public totalDistributed;
    uint256 public dividendsPerShare;
    uint256 public constant dividendsPerShareAccuracyFactor = 10 ** 36;

    uint256 public minPeriod = 3600;
    // uint256 public minDistribution = 1 * ( 10 **18 );//necesaria?

    uint256 currentIndex;

    //Mappings
    mapping (address => uint256) public shareholderIndexes;
    mapping (address => uint256) public shareholderClaims;
    mapping ( address => Share) public shares;

    //Events
    event DistributionCriteriaUpdate(uint256 minPeriod);
    event NewFundDeposit (uint256 amount);

    //Modifiers

    modifier onlyOwner() {
        require(msg.sender == owner, "!Token");
        _;
    }

    //Constructor
    constructor(address _reflectionToken) {
        owner = msg.sender;
        reflectionToken = _reflectionToken;
    }

    receive() external payable {}

    function setDistributionCriteria(uint256 _minPeriod) external override onlyOwner {
        minPeriod = _minPeriod;
        emit DistributionCriteriaUpdate(minPeriod);
    }

    function setShare(address shareholder, uint256 amount) external override onlyOwner {
        if(shares[shareholder].amount > 0)
		{
            distributeDividend(shareholder);
        }
		if(amount > 0 && shares[shareholder].amount == 0)
		{
           addShareholder(shareholder);
        }
		else if(amount == 0 && shares[shareholder].amount > 0)
		{
           removeShareholder(shareholder);
        }
        totalShares = totalShares - shares[shareholder].amount + amount;
        shares[shareholder].amount = amount;
        shares[shareholder].totalExcluded = getCumulativeDividends(shares[shareholder].amount);
    }

    function deposit(uint256 amount) external override onlyOwner {
        totalDividends = totalDividends + amount;
        dividendsPerShare = dividendsPerShare + dividendsPerShareAccuracyFactor * amount / totalShares;
        emit NewFundDeposit(amount);
    }

    function shouldDistribute(address shareholder) internal view returns (bool){
        return shareholderClaims[shareholder] + minPeriod < block.timestamp;
    }

    function getCumulativeDividends(uint256 share) internal view returns (uint256) {
        return share * dividendsPerShare / dividendsPerShareAccuracyFactor;
    }

    function addShareholder(address shareholder) internal {
        shareholderIndexes[shareholder] = shareholders.length;
        shareholders.push(shareholder);
    }
	
    function removeShareholder(address shareholder) internal {
        shareholders[shareholderIndexes[shareholder]] = shareholders[shareholders.length-1];
        shareholderIndexes[shareholders[shareholders.length-1]] = shareholderIndexes[shareholder];
        shareholders.pop();
    }

    function getUnpaidEarnings(address shareholder) public view returns (uint256) {
        if(shares[shareholder].amount == 0) {
            return 0;
        }

        uint256 shareholderTotalDividends = getCumulativeDividends(shares[shareholder].amount);
        uint256 shareholderTotalExcluded = shares[shareholder].totalExcluded;

        if(shareholderTotalDividends <= shareholderTotalExcluded){
            return 0;
        }
        return shareholderTotalDividends - shareholderTotalExcluded;
    }

    function distributeDividend(address shareholder) internal {
        if(shares[shareholder].amount == 0)
        {
            return;
        }

        uint256 amount = getUnpaidEarnings(shareholder);
        if(amount > 0)
        {
            IERC20(reflectionToken).transfer(shareholder,amount);
            totalDistributed = totalDistributed + amount;
            shareholderClaims[shareholder] = block.timestamp;
            shares[shareholder].totalRealised = shares[shareholder].totalRealised + amount;
            shares[shareholder].totalExcluded = getCumulativeDividends(shares[shareholder].amount);
        }
    }

    function process(uint256 gas) external override onlyOwner {
        uint256 shareholderCount = shareholders.length;

        if(shareholderCount == 0){
            return;
        }

        uint256 gasUsed = 0;
        uint256 gasLeft = gasleft();

        uint256 iterations = 0;

        while(gasUsed < gas && iterations < shareholderCount){
            if(currentIndex >= shareholderCount)
            {
                currentIndex = 0;
            }
            if(shouldDistribute(shareholders[currentIndex]))
            {
                distributeDividend(shareholders[currentIndex]);
            }
            gasUsed = gasUsed + gasLeft - gasleft();
            gasLeft = gasleft();
            currentIndex++;
            iterations++;
        }
    }

    function claimReflection() external {
        if(shouldDistribute(msg.sender))
        {
            distributeDividend(msg.sender);
        }
    }

    function updateReflectionToken(address _reflectionToken) external onlyOwner{
        require(_reflectionToken != address(0), "ReflectionToken cannot be address zero");
        reflectionToken = _reflectionToken;
    }


    function resetUnpaidEarnings() external onlyOwner {
        for (uint256 i = 0; i < shareholders.length; i++) {
            address shareholder = shareholders[i];
            shares[shareholder].totalRealised = 0;
            shares[shareholder].totalExcluded = 0;
        }
        totalDistributed = 0;
        totalDividends = 0;
        dividendsPerShare = 0;
    }

function withdrawOldReflectionToken(address tokenAddress, address to, uint256 amount) external onlyOwner {
    require(tokenAddress != address(0), "Token address cannot be the zero address");
    require(to != address(0), "Cannot withdraw to the zero address");
    require(amount > 0, "Amount must be greater than zero");
    uint256 balance = IERC20(tokenAddress).balanceOf(address(this));
    require(balance >= amount, "Insufficient balance");

    IERC20(tokenAddress).transfer(to, amount);
}

}

