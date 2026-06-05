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
  maxAge: 60 * 60 * 24 * 30,
  secret: process.env.SESSION_SECRET ?? 'kfc-lennik-super-secret-key-change-in-prod',
});

export default withAuth(
  config({
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL ?? 'postgresql://localhost/kfc_lennik',
      useMigrations: true,
    },
    lists,
    session,
    server: {
      cors: {
        origin: process.env.FRONTEND_URL
          ? [process.env.FRONTEND_URL, 'http://localhost:5173']
          : ['http://localhost:5173'],
        credentials: true,
      },
      port: parseInt(process.env.PORT ?? '3000'),
    },
    graphql: {
      playground: process.env.NODE_ENV !== 'production',
    },
  })
);
