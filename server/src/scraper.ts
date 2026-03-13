import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { Server } from 'socket.io';

puppeteer.use(StealthPlugin());

export interface ScraperResult {
  cnpj: string;
  nomeFantasia: string;
  inscricaoEstadual: string;
  status: 'success' | 'error';
  message?: string;
}

export class SintegraScraper {
  private browser: Browser | null = null;
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  private async emitProgress(socketId: string, current: number, total: number, message: string) {
    this.io.to(socketId).emit('progress', {
      current,
      total,
      percentage: Math.round((current / total) * 100),
      message
    });
  }

  async run(socketId: string, cnpjs: string[], cpf: string, senha: string): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];
    
    try {
      this.browser = await puppeteer.launch({
        headless: false, // Set to true in production, but GOV.BR might need interactive for captcha
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await this.browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      await this.emitProgress(socketId, 0, cnpjs.length, 'Iniciando login no GOV.BR...');

      // GOV.BR Login
      const loginSuccess = await this.loginGovBr(page, cpf, senha);
      if (!loginSuccess) {
        throw new Error('Falha na autenticação GOV.BR');
      }

      await this.emitProgress(socketId, 0, cnpjs.length, 'Login realizado. Iniciando consultas...');

      for (let i = 0; i < cnpjs.length; i++) {
        const cnpj = cnpjs[i];
        await this.emitProgress(socketId, i + 1, cnpjs.length, `Consultando CNPJ: ${cnpj}...`);

        try {
          const data = await this.scrapeCadesp(page, cnpj);
          results.push({
            cnpj,
            ...data,
            status: 'success'
          });
        } catch (error: any) {
          results.push({
            cnpj,
            nomeFantasia: 'N/A',
            inscricaoEstadual: 'N/A',
            status: 'error',
            message: error.message
          });
        }
      }

      await this.emitProgress(socketId, cnpjs.length, cnpjs.length, 'Processamento concluído!');

    } catch (error: any) {
      console.error('Scraper error:', error);
      this.io.to(socketId).emit('error', error.message);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }

    return results;
  }

  private async loginGovBr(page: Page, cpf: string, senha: string): Promise<boolean> {
    try {
      await page.goto('https://sso.acesso.gov.br/login', { waitUntil: 'networkidle2' });
      
      // Enter CPF
      await page.waitForSelector('#accountId');
      await page.type('#accountId', cpf);
      await page.click('#root > div > div > div.card > div.content > div.actions > button');

      // Enter Password
      await page.waitForSelector('#password');
      await page.type('#password', senha);
      await page.click('#root > div > div > div.card > div.content > div.actions > button');

      // Wait for login to complete (redirect to dashboard or specific app)
      // This is a generic check, might need refinement based on the specific Sintegra link
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }

  private async scrapeCadesp(page: Page, cnpj: string): Promise<{ nomeFantasia: string, inscricaoEstadual: string }> {
    // Navigate to CADESP search if not already there
    // Note: CADESP/Sintegra usually requires navigating after login
    const CADESP_URL = 'https://portal.fazenda.sp.gov.br/servicos/cadesp'; // Placeholder
    
    // Logic for CADESP search goes here
    // 1. Enter CNPJ
    // 2. Click Search
    // 3. Extract data

    // Placeholder extraction
    return {
      nomeFantasia: 'Empresa Teste LTDA',
      inscricaoEstadual: '123.456.789.000'
    };
  }
}
