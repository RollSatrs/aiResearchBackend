import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SummarizeController } from './summarize.controller';
import { SummarizeService } from './summarize.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';

@Module({
    imports: [ConfigModule, PrismaModule, SearchModule],
    controllers: [SummarizeController],
    providers: [SummarizeService],
})
export class SummarizeModule { }
