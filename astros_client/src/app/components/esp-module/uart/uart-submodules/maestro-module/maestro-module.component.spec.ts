import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaestroModuleComponent } from './maestro-module.component';

describe('MaestroModuleComponent', () => {
  let component: MaestroModuleComponent;
  let fixture: ComponentFixture<MaestroModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaestroModuleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MaestroModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
