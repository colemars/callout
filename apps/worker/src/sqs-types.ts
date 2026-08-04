/** The slice of the SQS Lambda event shape we consume (avoids @types/aws-lambda). */
export interface SQSEvent {
  Records: Array<{ body: string; messageId: string }>;
}
