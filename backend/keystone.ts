import { config } from '@keystone-6/core';
import { statelessSessions } from '@keystone-6/core/session';
import { createAuth } from '@keystone-6/auth';
import { lists } from './schema';

const { withAuth } = createAuth({
  listKey: 'Trainer',
  identityField: 'email',
  secretField: 'password',
  sessionData: 'id email name role team { id name category }',
  initFirstItem: {
    fields: ['name', 'email', 'password'],
    itemData: { role: 'admin' },
  },
});

const session = statelessSessions({
  maxAge: 60 * 60 * 24 * 30, // 30 days
  secret: process.env.SESSION_SECRET ?? 'kfc-lennik-super-secret-key-change-in-prod',
});

export default withAuth(
  config({
    db: {
      provider: 'sqlite',
      url: 'file:./kfc-lennik.db',
    },
    lists,
    session,
    server: {
      cors: {
        origin: ['http://localhost:5173'],
        credentials: true,
      },
      port: 3000,
    },
    graphql: {
      playground: true,
    },
  })
);
db: {
  provider: 'postgresql',
  url: process.env.DATABASE_URL || 'postgresql://localhost/kfc_lennik',
  useMigrations: true,  // ← voeg dit toe
},