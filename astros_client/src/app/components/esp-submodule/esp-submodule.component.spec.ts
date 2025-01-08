import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EspSubmoduleComponent } from './esp-submodule.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('EspSubmoduleComponent', () => {
  let component: EspSubmoduleComponent;
  let fixture: ComponentFixture<EspSubmoduleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EspSubmoduleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EspSubmoduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
