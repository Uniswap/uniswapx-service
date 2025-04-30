import { CommandType } from "@uniswap/universal-router-sdk";
import { Logger } from '@aws-lambda-powertools/logger'
import { defaultAbiCoder, Interface } from "ethers/lib/utils";
import { 
  UR_EXECUTE_DEADLINE_BUFFER,
  UR_EXECUTE_FUNCTION,
  UR_EXECUTE_SELECTOR,
  UR_EXECUTE_WITH_DEADLINE_SELECTOR,
  UR_FUNCTION_SIGNATURES,
  UR_SWEEP_PARAMETERS,
  UR_UNWRAP_WETH_PARAMETERS
} from "../handlers/constants";

export class UniversalRouterCalldata {
  private iface: Interface;
  private signature: string;
  private functionSelector: string;
  private commandArray: CommandType[];
  private inputsArray: any[];
  private log: Logger;

  constructor(calldata: string, log: Logger) {
    this.log = log;
    // Initialize with default values
    this.iface = new Interface([]);
    this.signature = '';
    this.functionSelector = '';
    this.commandArray = [];
    this.inputsArray = [];

    try {
      this.parseCalldata(calldata);
    } catch (e) {
      this.log.error('Error parsing calldata', {
        error: (e as Error)?.message ?? 'Unknown error',
        calldata
      });
      throw e;
    }
  }

  private parseCalldata(calldata: string): void {
    const HEX_PREFIX = "0x";
    const SELECTOR_BYTES = 4;
    const CHARS_PER_BYTE = 2;

    this.functionSelector = calldata.slice(
      HEX_PREFIX.length,
      HEX_PREFIX.length + SELECTOR_BYTES * CHARS_PER_BYTE
    );

    this.signature = UR_FUNCTION_SIGNATURES[this.functionSelector];
    if (!this.signature) {
      throw new Error('Unrecognized function selector in calldata');
    }

    this.iface = new Interface([this.signature]);

    const { commands, inputs } = this.iface.decodeFunctionData(UR_EXECUTE_FUNCTION, calldata);
    this.commandArray = getCommands(commands);
    this.inputsArray = [...inputs];
  }

  public removePayPortionCommand(): UniversalRouterCalldata {
    const payPortionIndex = this.commandArray.findIndex(command => command == CommandType.PAY_PORTION);
    if (payPortionIndex !== -1) {
      this.commandArray.splice(payPortionIndex, 1);
      this.inputsArray.splice(payPortionIndex, 1);
    }
    return this;
  }

  public modifySweepRecipient(recipient: string): UniversalRouterCalldata {
    const sweepIndex = this.commandArray.findIndex(command => command == CommandType.SWEEP);
    if (sweepIndex !== -1) {
      const sweepInput = this.inputsArray[sweepIndex];
      // Decode sweep parameters
      const [token, , amountMinimum] = defaultAbiCoder.decode(
        UR_SWEEP_PARAMETERS,
        sweepInput
      );
      // Encode the parameters with new recipient address
      const modifiedSweepInput = defaultAbiCoder.encode(
        UR_SWEEP_PARAMETERS,
        [token, recipient, amountMinimum]
      );
      this.inputsArray[sweepIndex] = modifiedSweepInput;
    }
    return this;
  }

  public modifyUnwrapRecipient(recipient: string): UniversalRouterCalldata {
    const unwrapIndex = this.commandArray.findIndex(command => command == CommandType.UNWRAP_WETH);
    if (unwrapIndex !== -1) {
      const unwrapInput = this.inputsArray[unwrapIndex];
      // Decode unwrap parameters
      const [, amountMin] = defaultAbiCoder.decode(
        UR_UNWRAP_WETH_PARAMETERS,
        unwrapInput
      );
      // Encode the parameters with new recipient address
      const modifiedUnwrapInput = defaultAbiCoder.encode(
        UR_UNWRAP_WETH_PARAMETERS,
        [recipient, amountMin]
      );
      this.inputsArray[unwrapIndex] = modifiedUnwrapInput;
    }
    return this;
  }

  public modifyTakeRecipient(recipient: string): UniversalRouterCalldata {
    const takeIndex = this.commandArray.findIndex(command => command == CommandType.TAKE);
    if (takeIndex !== -1) {
      this.inputsArray[takeIndex] = recipient;
    }
    return this;
  }
  
  public encode(): string {
    try {
      let modifiedCalldata;
      if (this.functionSelector == UR_EXECUTE_SELECTOR) {
        modifiedCalldata = this.iface.encodeFunctionData(UR_EXECUTE_FUNCTION, [this.commandArray, this.inputsArray]);
      } else if (this.functionSelector == UR_EXECUTE_WITH_DEADLINE_SELECTOR) {
        const newDeadline = Math.floor(Date.now() / 1000) + UR_EXECUTE_DEADLINE_BUFFER;
        modifiedCalldata = this.iface.encodeFunctionData(UR_EXECUTE_FUNCTION, [this.commandArray, this.inputsArray, newDeadline]);
      }

      if (!modifiedCalldata) {
        throw new Error('Failed to encode modified calldata');
      }

      return modifiedCalldata;
    } catch (e) {
      this.log.error('Error encoding modified calldata', {
        error: (e as Error)?.message ?? 'Unknown error'
      });
      throw e;
    }
  }
}

export function artemisModifyCalldata(calldata: string, log: Logger, executeAddress: string): string {
  try {
    const router = new UniversalRouterCalldata(calldata, log);
    return router
      .removePayPortionCommand()
      .modifySweepRecipient(executeAddress)
      .modifyUnwrapRecipient(executeAddress)
      .encode();
  } catch (e) {
    log.error('Error in artemisModifyCalldata', {
      error: (e as Error)?.message ?? 'Unknown error',
      calldata
    });
    return "";
  }
}

function getCommands(commands: string): CommandType[] {
  // Skip the "0x" prefix
  const hexString = commands.slice(2);
  
  // Validate this is a hex string with even length
  if (hexString.length % 2 !== 0) {
    throw new Error('Invalid commands hex string: length must be even');
  }
  
  const commandTypes: CommandType[] = [];
  for (let i = 0; i < hexString.length; i += 2) {
    const byte = hexString.substring(i, i + 2);
    commandTypes.push(parseInt(byte, 16) as CommandType);
  }
  
  return commandTypes;
}