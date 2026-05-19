import httpntlm from "httpntlm";

type NtlmConfig = {
  url: string;
  username: string;
  password: string;
  domain: string;
  workstation?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return String(v).trim();
}

function ntlmGetJSON(cfg: NtlmConfig): Promise<any> {
  return new Promise((resolve, reject) => {
    httpntlm.get(
      {
        url: cfg.url,
        username: cfg.username,
        password: cfg.password,
        domain: cfg.domain,
        workstation: cfg.workstation ?? "",
        headers: { Accept: "application/json" },
      },
      (err: any, res: any) => {
        if (err) return reject(err);
        if (res?.statusCode && res.statusCode >= 400) {
          const preview = String(res.body ?? "").slice(0, 300);
          return reject(new Error(`TFS NTLM GET HTTP ${res.statusCode}. Body=${preview}`));
        }
        try {
          resolve(JSON.parse(res.body));
        } catch {
          reject(new Error(`TFS NTLM GET parse error. Body=${String(res.body ?? "").slice(0, 300)}`));
        }
      }
    );
  });
}

function ntlmPostJSON(cfg: NtlmConfig, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    httpntlm.post(
      {
        url: cfg.url,
        username: cfg.username,
        password: cfg.password,
        domain: cfg.domain,
        workstation: cfg.workstation ?? "",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      },
      (err: any, res: any) => {
        if (err) return reject(err);
        if (res?.statusCode && res.statusCode >= 400) {
          const preview = String(res.body ?? "").slice(0, 300);
          return reject(new Error(`TFS NTLM POST HTTP ${res.statusCode}. Body=${preview}`));
        }
        try {
          resolve(JSON.parse(res.body));
        } catch {
          reject(new Error(`TFS NTLM POST parse error. Body=${String(res.body ?? "").slice(0, 300)}`));
        }
      }
    );
  });
}

export function createTfsClient() {
  const base = requireEnv("TFS_COLLECTION_URL");
  const domain = requireEnv("NTLM_DOMAIN");
  const username = requireEnv("NTLM_USERNAME");
  const password = requireEnv("NTLM_PASSWORD");
  const workstation = (process.env.NTLM_WORKSTATION ?? "").trim();

  const baseNormalized = base.replace(/\/+$/, "");

  const join = (p: string) => {
    const pathPart = String(p ?? "").trim();
    if (!pathPart) throw new Error("TFS client: path is empty");
    return `${baseNormalized}/${pathPart.replace(/^\/+/, "")}`;
  };

  return {
    get: (path: string) =>
      ntlmGetJSON({ url: join(path), domain, username, password, workstation }),
    post: (path: string, body: any) =>
      ntlmPostJSON({ url: join(path), domain, username, password, workstation }, body),
  };
}

export type TfsClient = ReturnType<typeof createTfsClient>;
