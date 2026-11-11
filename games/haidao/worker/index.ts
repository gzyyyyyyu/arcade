/** 海岛的 Worker 入口：只导出 default 和 DO 类（具名导出别的东西会让单独部署的 Worker 起不来），路由在 ./route.ts */
import { portsOf, type DoEnv } from './do.ts';
import { route, type Env } from './route.ts';

export { Base, Harbor } from './do.ts';
export { RoomMeter } from 'arcade-kit/meter';

export default { fetch: (request, env) => route(request, env, portsOf(env)) } satisfies ExportedHandler<Env & DoEnv>;
