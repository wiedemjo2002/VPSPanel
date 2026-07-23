#!/usr/bin/env bash
set -Eeuo pipefail

docker exec -i vpspanel-panel-1 node --input-type=module <<'NODE'
import { pool } from './lib/database.js';
import { encrypt } from './lib/security.js';
const user = (await pool.query('SELECT id FROM users WHERE github_id=-1')).rows[0];
if (!user) throw new Error('Open the E2E session URL before seeding the browser project.');
const config = { database: false, packageManager: 'npm', autoDeploy: false, webhookSecret: null };
const environment = encrypt({ NODE_ENV: 'production', PORT: '80' });
await pool.query(`INSERT INTO projects (id,user_id,owner,repo,branch,name,domain,framework,port,status,config,encrypted_env,current_deployment)
  VALUES ('1111111111111111',$1,'wiedemjo2002','VPSPanel-TestApp','main','Meine Test-App','fixture.localhost','static',80,'online',$2,$3,'22222222222222222222')
  ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,status='online',config=EXCLUDED.config,encrypted_env=EXCLUDED.encrypted_env,updated_at=NOW()`, [user.id, config, environment]);
await pool.query(`INSERT INTO deployments (id,project_id,status,image_tag) VALUES ('22222222222222222222','1111111111111111','healthy','vpspanel-project-1111111111111111:22222222222222222222') ON CONFLICT (id) DO NOTHING`);
await pool.end();
NODE
