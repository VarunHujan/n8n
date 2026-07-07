import { Test, TestingModule } from '@nestjs/testing';
import { DagWalkerService } from './dag-walker.service';

describe('DagWalkerService Security and Parameter Resolution', () => {
  let service: DagWalkerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DagWalkerService],
    }).compile();

    service = module.get<DagWalkerService>(DagWalkerService);
  });

  describe('resolvePath (safe path parsing)', () => {
    it('should correctly resolve valid dot notation paths', () => {
      const context = {
        trigger: {
          data: {
            email: 'user@example.com',
            user: {
              name: 'John Doe',
            },
          },
        },
      };

      const result = service['resolvePath'](
        '$node["trigger"].data.user.name',
        context
      );
      expect(result).toBe('John Doe');
    });

    it('should correctly resolve single quoted node IDs', () => {
      const context = {
        'my-trigger-node': {
          data: {
            value: 42,
          },
        },
      };

      const result = service['resolvePath'](
        "$node['my-trigger-node'].data.value",
        context
      );
      expect(result).toBe(42);
    });

    it('should correctly resolve array indices', () => {
      const context = {
        csv: {
          data: {
            rows: [
              { id: '1', name: 'First' },
              { id: '2', name: 'Second' },
            ],
          },
        },
      };

      const result = service['resolvePath'](
        '$node["csv"].data.rows[1].name',
        context
      );
      expect(result).toBe('Second');
    });

    it('should correctly resolve bracket string notation keys', () => {
      const context = {
        api: {
          data: {
            'content-type': 'application/json',
            "special key": "value"
          },
        },
      };

      const result1 = service['resolvePath'](
        '$node["api"].data["content-type"]',
        context
      );
      expect(result1).toBe('application/json');

      const result2 = service['resolvePath'](
        "$node['api'].data['special key']",
        context
      );
      expect(result2).toBe('value');
    });

    it('should return undefined for missing nodes', () => {
      const context = {};
      const result = service['resolvePath'](
        '$node["missing_node"].data.name',
        context
      );
      expect(result).toBeUndefined();
    });

    it('should return undefined for missing properties in path without throwing', () => {
      const context = {
        api: {
          data: {},
        },
      };
      const result = service['resolvePath'](
        '$node["api"].data.missing.property',
        context
      );
      expect(result).toBeUndefined();
    });

    it('should block arbitrary code execution and return undefined', () => {
      const context = {
        api: {
          data: {
            value: 'secret',
          },
        },
      };

      const maliciousPath1 = '$node["api"].data.value; require("fs").writeFileSync("hack.txt", "RCE")';
      const maliciousPath2 = 'new Function("return 1")()';
      
      const result1 = service['resolvePath'](maliciousPath1, context);
      const result2 = service['resolvePath'](maliciousPath2, context);

      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
    });
  });

  describe('resolveParameters (parameter expansion)', () => {
    it('should replace exact match templates with original types', () => {
      const executionData = new Map<string, any>();
      executionData.set('api_node', { response: { status: 200, headers: { type: 'json' } } });

      const params = {
        headerVal: '{{ $node["api_node"].data.response.headers }}',
        staticVal: 'hello world',
      };

      const resolved = service['resolveParameters'](params, executionData);
      expect(resolved.headerVal).toEqual({ type: 'json' });
      expect(resolved.staticVal).toBe('hello world');
    });

    it('should replace partial match templates with string interpolation', () => {
      const executionData = new Map<string, any>();
      executionData.set('user_node', { name: 'Alice', role: 'admin' });

      const params = {
        greeting: 'Welcome {{ $node["user_node"].data.name }}! Role: {{ $node["user_node"].data.role }}',
      };

      const resolved = service['resolveParameters'](params, executionData);
      expect(resolved.greeting).toBe('Welcome Alice! Role: admin');
    });

    it('should recursively resolve arrays and nested objects', () => {
      const executionData = new Map<string, any>();
      executionData.set('node1', { val: 100 });

      const params = {
        list: ['{{ $node["node1"].data.val }}', 200],
        nested: {
          inner: '{{ $node["node1"].data.val }}',
        },
      };

      const resolved = service['resolveParameters'](params, executionData);
      expect(resolved.list).toEqual([100, 200]);
      expect(resolved.nested.inner).toBe(100);
    });

    it('should handle malformed templates safely without executing them', () => {
      const executionData = new Map<string, any>();
      executionData.set('node1', { val: 100 });

      const params = {
        maliciousExact: '{{ require("fs").readFileSync("...") }}',
        maliciousPartial: 'Value is {{ require("fs").readFileSync("...") }}'
      };

      const resolved = service['resolveParameters'](params, executionData);
      // Exact match should return the original literal string on failure to resolve path
      expect(resolved.maliciousExact).toBe('{{ require("fs").readFileSync("...") }}');
      // Partial match should replace the block with an empty string
      expect(resolved.maliciousPartial).toBe('Value is ');
    });
  });
});
