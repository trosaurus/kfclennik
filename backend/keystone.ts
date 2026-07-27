import { config } from '@keystone-6/core';
import { statelessSessions } from '@keystone-6/core/session';
import { createAuth } from '@keystone-6/auth';
import { lists } from './schema';
import { extendGraphqlSchema } from './customSchema';

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
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres123@127.0.0.1:5432/kfc_lennik',
      shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? 'postgresql://postgres:postgres123@127.0.0.1:5432/kfc_lennik_shadow',
    },
    lists,
    session,
    extendGraphqlSchema,
    server: {
      cors: {
        origin: ['http://localhost:5173'],
        credentials: true,
      },
      port: 3000,
    },
    graphql: {
      playground: true,
      // Standaard limiet van body-parser (100kb) is te klein voor een
      // base64-gecodeerde manual-PDF (uploadTeamManual/customSchema.ts).
      bodyParser: { limit: '30mb' },
    },
  })
);
