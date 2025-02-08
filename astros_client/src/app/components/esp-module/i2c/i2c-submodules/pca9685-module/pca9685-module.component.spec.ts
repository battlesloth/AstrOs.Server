import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Pca9685ModuleComponent } from './pca9685-module.component';

describe('Pca9685ModuleComponent', () => {
  let component: Pca9685ModuleComponent;
  let fixture: ComponentFixture<Pca9685ModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Pca9685ModuleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Pca9685ModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
