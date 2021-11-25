import { TestBed } from '@angular/core/testing';

import { ModulesService } from './modules.service';

describe('ModulesService', () => {
  let service: ModulesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ModulesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
