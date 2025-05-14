import { CommandParser, CommandType } from "@uniswap/universal-router-sdk";
import { Logger } from '@aws-lambda-powertools/logger'
import { defaultAbiCoder, Interface } from "ethers/lib/utils";
import { 
  UR_ACTIONS_PARAMETERS,
  UR_EXECUTE_DEADLINE_BUFFER,
  UR_EXECUTE_FUNCTION,
  UR_EXECUTE_SELECTOR,
  UR_EXECUTE_WITH_DEADLINE_SELECTOR,
  UR_FUNCTION_SIGNATURES,
  UR_SWEEP_PARAMETERS,
  UR_TAKE_PARAMETERS,
  UR_UNWRAP_WETH_PARAMETERS,
  HEX_PREFIX,
  UR_SELECTOR_BYTES,
  UR_BYTES_PER_ACTION,
  HEX_BASE,
  CHARS_PER_BYTE
} from "../handlers/constants";
import { Actions } from '@uniswap/v4-sdk'

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
    this.functionSelector = calldata.slice(
      HEX_PREFIX.length,
      HEX_PREFIX.length + UR_SELECTOR_BYTES * CHARS_PER_BYTE
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

  public modifyV4SwapRecipient(recipient: string): UniversalRouterCalldata {
    const v4SwapIndex = this.commandArray.findIndex(
      (command) => command === CommandType.V4_SWAP
    )

    if (v4SwapIndex === -1) return this

    const v4Input = this.inputsArray[v4SwapIndex] as string

    // Decode wrapper structure to (actionsHex, params[])
    const [actionsHex, paramsArray]: [string, string[]] = defaultAbiCoder.decode(
      UR_ACTIONS_PARAMETERS,
      v4Input
    ) as [string, string[]]

    const bytesWithout0x = actionsHex.startsWith(HEX_PREFIX) ? actionsHex.slice(HEX_PREFIX.length) : actionsHex
    const updatedParams = [...paramsArray]

    // Go through actions to rewrite recipient
    for (let i = 0; i < bytesWithout0x.length; i += UR_BYTES_PER_ACTION) {
      const actionByte = parseInt(bytesWithout0x.slice(i, i + UR_BYTES_PER_ACTION), HEX_BASE) as Actions

      if (actionByte === Actions.TAKE) {
        // paramIndex is half the index of the action byte since each 
        // action takes 2 chars in the byte string
        const paramIndex = i / UR_BYTES_PER_ACTION
        const encodedInput = paramsArray[paramIndex]

        // Decode existing TAKE parameters
        const [currency, , amount] = defaultAbiCoder.decode(
          UR_TAKE_PARAMETERS,
          encodedInput
        )

        // Re-encode with the new recipient
        updatedParams[paramIndex] = defaultAbiCoder.encode(
          UR_TAKE_PARAMETERS,
          [currency, recipient, amount]
        )
      } // We can add more cases here if we want to modify other V4 actions
    }

    // Re-encode wrapper structure and put it back
    const modifiedV4Input = defaultAbiCoder.encode(
      UR_ACTIONS_PARAMETERS,
      [actionsHex, updatedParams]
    )
    this.inputsArray[v4SwapIndex] = modifiedV4Input

    return this
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

  public getOriginalRecipient(): string | null {
    const sweepIndex = this.commandArray.findIndex(command => command == CommandType.SWEEP);
    if (sweepIndex !== -1) {
      const sweepInput = this.inputsArray[sweepIndex];
      // Decode sweep parameters to get the original recipient
      const [, recipient] = defaultAbiCoder.decode(
        UR_SWEEP_PARAMETERS,
        sweepInput
      );
      return recipient;
    }
    return null;
  }
}

export function artemisModifyCalldata(calldata: string, log: Logger, executeAddress: string): string {
  try {
    const router = new UniversalRouterCalldata(calldata, log);
    const originalRecipient = router.getOriginalRecipient();
    const modifiedCalldata = router
      .removePayPortionCommand()
      .modifySweepRecipient(executeAddress)
      .modifyUnwrapRecipient(executeAddress)
      .modifyV4SwapRecipient(executeAddress)
      .encode();

    // detect if the original recipient is still present in the calldata
    if (originalRecipient) {
      const decoded = CommandParser.parseCalldata(modifiedCalldata);
      const originalRecipientIndex = JSON.stringify(decoded).indexOf(originalRecipient.slice(HEX_PREFIX.length));
      if (originalRecipientIndex !== -1) {
        throw new Error(`Original recipient still present in calldata. originalRecipient: ${originalRecipient}, modifiedCalldata: ${modifiedCalldata}`);
      }
    }
    return modifiedCalldata;
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
  for (let i = 0; i < hexString.length; i += CHARS_PER_BYTE) {
    const byte = hexString.substring(i, i + CHARS_PER_BYTE);
    commandTypes.push(parseInt(byte, HEX_BASE) as CommandType);
  }
  
  return commandTypes;
}