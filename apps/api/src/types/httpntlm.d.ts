declare module "httpntlm" {
  type NtlmOptions = {
    url: string;
    username: string;
    password: string;
    domain: string;
    workstation?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  type NtlmCallback = (err: any, res: { statusCode?: number; body: string }) => void;

  const httpntlm: {
    get(options: NtlmOptions, callback: NtlmCallback): void;
    post(options: NtlmOptions, callback: NtlmCallback): void;
  };

  export default httpntlm;
}