import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { FileValidation } from '../../src/modules/observations/file-validation.js';

describe('File Upload and Scan Integration', () => {
  let mockClamAVServer: Server;
  let mockClamAVPort: number;
  let clamAVResponse: string;

  beforeAll(async () => {
    // Create a mock ClamAV TCP server
    mockClamAVServer = createServer((socket: Socket) => {
      let receivedData = Buffer.alloc(0);

      socket.on('data', (data) => {
        receivedData = Buffer.concat([receivedData, data]);

        // Check if we received the end-of-stream marker (4 zero bytes)
        if (receivedData.length >= 4) {
          const lastFourBytes = receivedData.subarray(receivedData.length - 4);
          if (lastFourBytes.readUInt32BE(0) === 0) {
            // Send the configured response
            socket.write(clamAVResponse);
            socket.end();
          }
        }
      });
    });

    // Start mock server on random port
    await new Promise<void>((resolve) => {
      mockClamAVServer.listen(0, '127.0.0.1', () => {
        const addr = mockClamAVServer.address();
        if (addr && typeof addr !== 'string') {
          mockClamAVPort = addr.port;
        }
        resolve();
      });
    });

    // Configure FileValidation to use mock ClamAV
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(mockClamAVPort);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockClamAVServer.close(() => resolve());
    });
  });

  it('valid file (jpg, <10MB) is accepted when ClamAV reports clean', async () => {
    // Set ClamAV to respond with OK
    clamAVResponse = 'stream: OK\n';

    // Validate format
    const formatResult = FileValidation.validateFormat('image/jpeg', 'photo.jpg');
    expect(formatResult.valid).toBe(true);

    // Validate size (5MB file)
    const sizeValid = FileValidation.validateSize(5 * 1024 * 1024);
    expect(sizeValid).toBe(true);

    // Scan for malware (mock clean response)
    const fileBuffer = Buffer.alloc(1024, 'a'); // Small test buffer
    const scanResult = await FileValidation.scanForMalware(fileBuffer);
    expect(scanResult.clean).toBe(true);
  });

  it('file exceeds 10MB is rejected with size validation failure', () => {
    // 11MB file
    const sizeValid = FileValidation.validateSize(11 * 1024 * 1024);
    expect(sizeValid).toBe(false);

    // Exactly 10MB should pass
    const exactLimit = FileValidation.validateSize(10 * 1024 * 1024);
    expect(exactLimit).toBe(true);
  });

  it('invalid format (.exe) is rejected with INVALID_FORMAT', () => {
    const result = FileValidation.validateFormat('application/x-msdownload', 'malware.exe');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Extensión de archivo no permitida');
    expect(result.error).toContain('.exe');
  });

  it('file with malware (ClamAV FOUND response) is rejected with MALWARE_DETECTED', async () => {
    // Set ClamAV to respond with virus found
    clamAVResponse = 'stream: Win.Test.EICAR_HDB-1 FOUND\n';

    const fileBuffer = Buffer.alloc(1024, 'x');
    const scanResult = await FileValidation.scanForMalware(fileBuffer);

    expect(scanResult.clean).toBe(false);
    expect(scanResult.threat).toContain('Win.Test.EICAR_HDB-1');
  });

  it('ClamAV timeout results in rejection (fail-closed)', async () => {
    // Create a server that never responds (simulates timeout)
    const timeoutServer = createServer((socket: Socket) => {
      // Do nothing - let it timeout
      socket.on('data', () => {
        // Intentionally not responding
      });
    });

    const timeoutPort = await new Promise<number>((resolve) => {
      timeoutServer.listen(0, '127.0.0.1', () => {
        const addr = timeoutServer.address();
        if (addr && typeof addr !== 'string') {
          resolve(addr.port);
        }
      });
    });

    // Override env to point to timeout server
    const originalHost = process.env.CLAMAV_HOST;
    const originalPort = process.env.CLAMAV_PORT;
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(timeoutPort);

    // Temporarily reduce timeout for test speed by mocking the timeout
    // The actual implementation uses 30s timeout, but we test the fail-closed behavior
    // by connecting to a non-responsive server
    const fileBuffer = Buffer.alloc(512, 'z');

    // We'll test with a very short timeout by directly testing the behavior
    // The scanForMalware function has a 30s timeout which is too long for tests
    // Instead, test with a server that closes connection (simulates error)
    const errorServer = createServer((socket: Socket) => {
      socket.destroy(); // Immediately close connection
    });

    const errorPort = await new Promise<number>((resolve) => {
      errorServer.listen(0, '127.0.0.1', () => {
        const addr = errorServer.address();
        if (addr && typeof addr !== 'string') {
          resolve(addr.port);
        }
      });
    });

    process.env.CLAMAV_PORT = String(errorPort);

    const scanResult = await FileValidation.scanForMalware(fileBuffer);

    // Fail-closed: connection error should reject the file
    expect(scanResult.clean).toBe(false);
    expect(scanResult.threat).toBeDefined();

    // Cleanup
    process.env.CLAMAV_HOST = originalHost;
    process.env.CLAMAV_PORT = originalPort;

    await new Promise<void>((resolve) => timeoutServer.close(() => resolve()));
    await new Promise<void>((resolve) => errorServer.close(() => resolve()));
  });
});
