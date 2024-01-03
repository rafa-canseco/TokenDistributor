// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

//Importaciones
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJoeFactory,IJoeRouter,IJoe2Router} from "./interfaces/IJoe.sol";
import "./interfaces/ERC20.sol";
import {Distributor} from "./Distributor.sol";

//Contrato
contract Token is ERC20, Ownable {

    //State Variables
    uint256 public maxTx;
    // uint256 public maxWallet;

    uint256[] public reflectionFee;

    uint256 public swapTokensAtAmount;
    uint256 public distributorGas;

    uint256 private reflectionFeeTotal;

    IJoeRouter public joeRouter;
    address public joePair;
    address public reflectionToken;
    address public distributorAddress;
    Distributor distributor;
    
    bool public swapping;
    bool public distributionEnabled;
    bool public reflectionsEnabled;

    //Mapping
    mapping(address => bool) public isDividendExempt;
    mapping(address => bool) public isExcludedFromFee;
    mapping(address => bool) public isAutomatedMarketMakerPairs;

    //Events
    event AccountExcludeFromFee(address account, bool status);
    event SwapTokensAmountUpdated(uint256 amount);
    event AutomatedMarketMakerPairUpdated(address pair, bool value);
    event RewardTokenUpdated(address _reflectionToken);
    event DividendExemptUpdated(address holder, bool status);

    //Constructor
    constructor(address initialOwner) Ownable(initialOwner) ERC20("TestingToken", "TEST"){

        reflectionToken = address(0xf7B084572BD638d8282f4933143a8eac94482F28);
        joeRouter = IJoeRouter(0x60aE616a2155Ee3d9A68541Ba4544862310933d4);
        joePair = IJoeFactory(joeRouter.factory()).createPair(address(this), joeRouter.WAVAX());

        distributor = new Distributor(reflectionToken);
        distributorAddress = address(distributor);


        reflectionFee.push(500);
        reflectionFee.push(500);
        reflectionFee.push(500);

        isExcludedFromFee[address(joePair)] = true;
        isExcludedFromFee[address(this)] = true;

        isDividendExempt[address(joePair)] = true;
        isDividendExempt[address(this)] = true;

        isAutomatedMarketMakerPairs[address(joePair)] = true;
        swapTokensAtAmount = 100_000_000 * (10 ** 18);
        distributorGas = 300000;

        maxTx = 1_000_000_000 * (10 ** 18);
        // maxWallet = 1_000_000 * (10 ** 18); //limite de % para la primera hora

        distributionEnabled = true;
        reflectionsEnabled = true;
        _mint(address(msg.sender), 100_000_000_000 * (10 ** 18));
    }

    receive() external payable {}

    //Functions for settings

    function excludeFromFee(address account, bool status) external onlyOwner {
        require(isExcludedFromFee[account] != status, "Account is already the value of 'status");

        isExcludedFromFee[account] = status;
        emit AccountExcludeFromFee(account, status);
    }
    
    function setSwapTokensAtAmount(uint256 amount) external onlyOwner {
        require(amount <= totalSupply(), "Amount cannot be over the total supply" );

        swapTokensAtAmount = amount;
        emit SwapTokensAmountUpdated(amount);
    }

    function setAutomatedMarketMakerPair(address pair, bool value) external onlyOwner {
        require(pair != address(0),"Zero Address");

        isAutomatedMarketMakerPairs[address(pair)] = value;
        emit AutomatedMarketMakerPairUpdated(pair, value);
    }

    function setIsDividendExempt(address holder, bool status)external onlyOwner{
        isDividendExempt[holder] = status;
        if(status)
        {
            distributor.setShare(holder,0);
        }  
        else
        {
            distributor.setShare(holder, balanceOf(holder));
        }
        emit DividendExemptUpdated(holder, status);
    }

    function setDistributionStatus(bool status) external onlyOwner {
        distributionEnabled = status;
    }

    function setDistributionCriteria(uint256 minPeriod) external onlyOwner {
        distributor.setDistributionCriteria(minPeriod);
    }

    function setDistributorGas(uint256 gas) external onlyOwner {
        require(gas < 750000, "Gas is greater than limit");
        distributorGas = gas;
    }

    function removeMaxTx() external onlyOwner{
        maxTx = 100_000_000_000 * (10 **18 );
    }

    function disableReflections() external onlyOwner {
        if(reflectionsEnabled == true)
        {
            reflectionsEnabled = false;
        }
        else 
        {
        reflectionsEnabled = true;
        }
    }

    function setReflectionToken(address _reflectionToken) external onlyOwner {
        require(_reflectionToken != address(0),"Reflection Token cannot be address zero");

        // distributor.resetUnpaidEarnings();
        reflectionToken = _reflectionToken;
        distributor.updateReflectionToken(_reflectionToken);
        emit RewardTokenUpdated(_reflectionToken);
    }

    function emergencyWithdrawAvax() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No AVAX balance to withdraw");
        // Convertir 'owner' a 'address payable'
        address payable ownerPayable = payable(owner());
        (bool success, ) = ownerPayable.call{value: balance}("");
        require(success, "Transfer Failed");
    }

    function withdrawSpecificReflectionToken(address tokenAddress, address to,uint256 amount) external onlyOwner {
    require(tokenAddress != address(0), "Token address cannot be the zero address");
    require(to != address(0), "Withdrawal address cannot be the zero address");
    
    uint256 tokenBalance = IERC20(tokenAddress).balanceOf(distributorAddress);
    if (tokenBalance > 0) {
        distributor.withdrawOldReflectionToken(tokenAddress,to, amount);
    }
}

    //Functions for Fee

    function collectFee(uint256 amount, bool sell, bool p2p)private returns (uint256) {
        uint256 newReflectionFee = amount * (p2p ? reflectionFee[2] : sell ? reflectionFee[1] : reflectionFee[0]) / 10000;
   
        reflectionFeeTotal += newReflectionFee;
        return (newReflectionFee);
    }

    //Functions for Swap

    function swapTokensForAvax(uint256 tokenAmount) private {
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = joeRouter.WAVAX();

        _approve(address(this), address(joeRouter), tokenAmount);
        joeRouter.swapExactTokensForAVAXSupportingFeeOnTransferTokens(
            tokenAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }

	function swapAvaxForReflection(uint256 AvaxAmount) private {
        address[] memory path = new address[](2);
        path[0] = joeRouter.WAVAX();
        path[1] = address(reflectionToken);
		
        joeRouter.swapExactAVAXForTokens{value: AvaxAmount}(
            0,
            path,
            address(this),
            block.timestamp
        );
    }

	function _transfer(address sender, address recipient, uint256 amount) internal override(ERC20){      
		if(!isDividendExempt[recipient]) {
			require(amount <= maxTx, "Amount over max transaction allowed");
			// require(balanceOf(recipient) + amount <= maxWallet, "Max wallet reached");
		}
	
		uint256 contractTokenBalance = balanceOf(address(this));
		bool canSwap = contractTokenBalance >= swapTokensAtAmount;
		
		if (canSwap == true && !swapping && isAutomatedMarketMakerPairs[recipient] == true && reflectionsEnabled == true) 
		{
			uint256 tokenToReflection = reflectionFeeTotal;
			uint256 tokenToSwap = tokenToReflection;

			if(tokenToSwap >= swapTokensAtAmount) 
			{
			    swapping = true;
				swapTokensForAvax(swapTokensAtAmount);
				uint256 AvaxBalance = address(this).balance;
                
				uint256 reflectionPart = AvaxBalance;
				
				if(reflectionPart > 0)
				{
                    swapAvaxForReflection(reflectionPart);
					uint256 reflectionBalance = IERC20(reflectionToken).balanceOf(address(this));
					IERC20(reflectionToken).transfer(distributorAddress, reflectionBalance);
				    distributor.deposit(reflectionBalance);
				    reflectionFeeTotal = reflectionFeeTotal - ((swapTokensAtAmount * tokenToReflection) / (tokenToSwap));
				}
				swapping = false;
			}
        }
		
		if(isExcludedFromFee[sender] || isExcludedFromFee[recipient]) 
		{
            super._transfer(sender, recipient, amount);
        }
		else 
		{
		    uint256 allFee = collectFee(amount, isAutomatedMarketMakerPairs[recipient], !isAutomatedMarketMakerPairs[sender] && !isAutomatedMarketMakerPairs[recipient]);
			if(allFee > 0) 
			{
			   super._transfer(sender, address(this), allFee);
			}
			super._transfer(sender, recipient, amount - allFee);
        }
		
		if(!isDividendExempt[sender]){ try distributor.setShare(sender, balanceOf(sender)) {} catch {} }
        if(!isDividendExempt[recipient]){ try distributor.setShare(recipient, balanceOf(recipient)) {} catch {} }
		if(distributionEnabled) 
		{
		   try distributor.process(distributorGas) {} catch {}
		}
    }



    



}