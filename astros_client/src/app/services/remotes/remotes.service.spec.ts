import { TestBed } from '@angular/core/testing';

import { RemotesService } from '../remotes/remotes.service';

describe('RemotesService', () => {
  let service: RemotesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RemotesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
