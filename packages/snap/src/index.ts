import {
  OnRpcRequestHandler,
  OnTransactionHandler,
} from '@metamask/snap-types';
import {
  add0x,
  bytesToHex,
  hasProperty,
  isObject,
  Json,
  remove0x,
} from '@metamask/utils';
import { decode } from '@metamask/abi-utils';

const API_ENDPOINT =
  'https://www.4byte.directory/api/v1/signatures/?hex_signature=';

/* eslint-disable camelcase */
type FourByteSignature = {
  id: number;
  created_at: string;
  text_signature: string;
  hex_signature: string;
  bytes_signature: string;
};
/* eslint-enable camelcase */

/**
 * Get a message from the origin. For demonstration purposes only.
 *
 * @param originString - The origin string.
 * @returns A message based on the origin.
 */

export const getMessage = (originString: string): string =>
  `Hello, ${originString}!`;

/**
 * Handle incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
 *
 * @param args - The request handler args as object.
 * @param args.origin - The origin of the request, e.g., the website that
 * invoked the snap.
 * @param args.request - A validated JSON-RPC request object.
 * {
 *  "jsonrpc":"2.0",
 *  "id":"mFt6NVls3979Ti375IpXF",
 *  "method":"hello"
 * }
 * @returns `null` if the request succeeded.
 * @throws If the request method is not valid for this snap.
 * @throws If the `snap_confirm` call failed.
 */
//origin, request, transaction
export const onRpcRequest: OnRpcRequestHandler = ({ origin, request }) => {
  switch (request.method) {
    case 'hello':
      console.log('waiting');
      return wallet.request({
        method: 'snap_confirm',
        params: [
          {
            prompt: getMessage(origin),
            description: `This custom confirmation is just for display purposes.`,
            textAreaContent: `But you can edit the snap source code to make it do something, if you want to!`,
          },
        ],
      });
    default:
      throw new Error('Method not found.');
  }
};

export const onTransaction: OnTransactionHandler = async ({ transaction }) => {
  const insights: { type: string; params?: Json } = { type: 'Unknow tx type' };
  if (
    !isObject(transaction) ||
    !hasProperty(transaction, 'data') ||
    typeof transaction.data !== 'string'
  ) {
    console.warn('Unknown tx type');
    return { insights };
  }
  //0xa456ui97...
  const txData = remove0x(transaction.data);
  const funcSig = txData.slice(0, 8);

  const res = await fetch(`${API_ENDPOINT}${add0x(funcSig)}`, {
    method: 'get',
    headers: {
      'Content-type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Unable to fetch func call data');

  const { results } = (await res.json()) as {
    results: FourByteSignature[];
  };

  const [functionTextSignature] = results
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((val) => val.text_signature);

  if (!functionTextSignature) {
    console.warn('No defined function signature in registry');
    return { insights };
  }

  insights.type = functionTextSignature;

  const paramTypes = functionTextSignature
    .slice(
      functionTextSignature.indexOf('(') + 1,
      functionTextSignature.indexOf(')'),
    )
    .split(',');
  const decoded = decode(paramTypes, add0x(txData.slice(8)));
  insights.params = decoded.map(normalizeAbiValue);
  return { insights };

  /**
   * The ABI decoder returns certain which are not JSON serializable. This
   * function converts them to strings.
   *
   * @param value - The value to convert.
   * @returns The converted value.
   */
  function normalizeAbiValue(value: unknown): Json {
    if (Array.isArray(value)) {
      return value.map(normalizeAbiValue);
    }

    if (value instanceof Uint8Array) {
      return bytesToHex(value);
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    return value as Json;
  }
};
