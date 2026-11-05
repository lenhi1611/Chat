import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

/** Opts a controller or route out of the global Bearer-token guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
