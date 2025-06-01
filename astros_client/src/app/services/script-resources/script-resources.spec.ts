import { TestBed } from '@angular/core/testing';
import { ScriptResourcesService } from './script-resources.service';
import { ControllerService } from '../controllers/controller.service';
import { mock } from 'jest-mock-extended';

describe('ScriptResourcesService', () => {
  let service: ScriptResourcesService;

  const mockControllerService = mock<ControllerService>();

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = new ScriptResourcesService(mockControllerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
