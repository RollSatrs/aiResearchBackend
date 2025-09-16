import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { SummarizeService } from './summarize.service';
import { SummarizeDto } from './dto/summarize.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('summarize')
@UseGuards(JwtAuthGuard)
export class SummarizeController {
    constructor(private summarizeService: SummarizeService) { }

    @Post()
    summarize(@Body() dto: SummarizeDto, @Request() req) {
        return this.summarizeService.summarize(dto, req.user.id);
    }
}
