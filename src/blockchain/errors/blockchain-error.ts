export enum BlockchainErrorType {
  RETRYABLE = 'RETRYABLE',
  NON_RETRYABLE = 'NON_RETRYABLE',
}

export class BlockchainErrorClassifier {
  /**
   * Classifies a blockchain error as retryable or non-retryable.
   */
  static classify(error: any): BlockchainErrorType {
    const message = (error?.message || '').toLowerCase();

    // Known retryable errors
    if (
      message.includes('network error') ||
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('nonce too low') ||
      message.includes('too many requests')
    ) {
      return BlockchainErrorType.RETRYABLE;
    }

    // Known non-retryable errors
    if (
      message.includes('insufficient funds') ||
      message.includes('invalid address') ||
      message.includes('gas required exceeds allowance') ||
      message.includes('revert')
    ) {
      return BlockchainErrorType.NON_RETRYABLE;
    }

    // Default to non-retryable for unknown errors
    return BlockchainErrorType.NON_RETRYABLE;
  }

  /**
   * Returns an actionable, user-safe message stripped of sensitive info like node URLs.
   */
  static getActionableMessage(error: any): string {
    const message = error?.message || 'Unknown blockchain error';
    
    // Strip sensitive internal URLs
    const sanitizedMessage = message.replace(/(https?:\/\/[^\s]+)/g, '<REDACTED_URL>');

    if (this.classify(error) === BlockchainErrorType.RETRYABLE) {
      return `Transaction failed temporarily: ${sanitizedMessage}. Please try again.`;
    }

    return `Transaction failed permanently: ${sanitizedMessage}. Please review the error and correct your input.`;
  }
}
