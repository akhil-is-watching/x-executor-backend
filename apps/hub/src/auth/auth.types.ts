export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    orgId: string;
  };
}
