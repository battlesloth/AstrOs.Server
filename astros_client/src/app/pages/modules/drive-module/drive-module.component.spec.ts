import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriveModuleComponent } from './drive-module.component';

describe('DriveModuleComponent', () => {
  let component: DriveModuleComponent;
  let fixture: ComponentFixture<DriveModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DriveModuleComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DriveModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
