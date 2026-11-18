import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'feature-flag';

export const FeatureFlag = (flag: string) => SetMetadata(FEATURE_FLAG_KEY, flag);
