export interface User {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  sessionToken?: string;
  coins?: number;
  soundEnabled?: boolean;} 