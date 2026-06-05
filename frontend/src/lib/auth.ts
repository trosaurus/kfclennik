const GQL_URL = (import.meta.env.VITE_API_URL ?? '') + '/api/graphql';

export interface Trainer {
  id: string;
  name: string;
  email: string;
  role: string;
  team: { id: string; name: string; category: string } | null;
}

async function gqlAuth(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map((e: { message: string }) => e.message).join('; '));
  return data.data;
}

export async function login(email: string, password: string): Promise<{ ok: boolean; message?: string; trainer?: Trainer }> {
  const data = await gqlAuth(
    `mutation Login($email: String!, $password: String!) {
       authenticateTrainerWithPassword(email: $email, password: $password) {
         ... on TrainerAuthenticationWithPasswordSuccess {
           item { id name email role team { id name category } }
         }
         ... on TrainerAuthenticationWithPasswordFailure {
           message
         }
       }
     }`,
    { email, password }
  );
  const result = data.authenticateTrainerWithPassword;
  if (result?.item) return { ok: true, trainer: result.item };
  return { ok: false, message: result?.message ?? 'Onbekende fout' };
}

export async function logout(): Promise<void> {
  await gqlAuth(`mutation { endSession }`);
}

export async function getMe(): Promise<Trainer | null> {
  try {
    const data = await gqlAuth(
      `query { authenticatedItem { ... on Trainer { id name email role team { id name category } } } }`
    );
    return data.authenticatedItem ?? null;
  } catch {
    return null;
  }
}
