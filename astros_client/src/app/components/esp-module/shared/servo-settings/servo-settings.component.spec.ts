import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServoSettingsComponent } from './servo-settings.component';

describe('ServoSettingsComponent', () => {
  let component: ServoSettingsComponent;
  let fixture: ComponentFixture<ServoSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServoSettingsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ServoSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
