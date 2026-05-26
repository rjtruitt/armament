/** Unified interface for invoking any LLM provider. */
export interface ILLMProvider {
  invoke(messages: any[], options?: any): Promise<any>;
  getInfo?(): { provider: string; model: string; capabilities: string[] };
  shutdown?(): Promise<void>;
}
/** Interface for the deduplicating provider pool. */
export interface IProviderPool {
  getOrCreate(providerType: string, model: string, opts?: {
    region?: string;
    profile?: string;
    apiKey?: string;
    baseURL?: string;
    streaming?: boolean;
    providerName?: string;
  }): Promise<ILLMProvider>;
  get(providerType: string, model: string): ILLMProvider | undefined;
  has(providerType: string, model: string): boolean;
  readonly size: number;
}