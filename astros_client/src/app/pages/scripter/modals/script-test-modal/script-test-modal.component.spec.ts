import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScriptTestModalComponent } from './script-test-modal.component';

describe('ScriptTestModalComponent', () => {
  let component: ScriptTestModalComponent;
  let fixture: ComponentFixture<ScriptTestModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [ScriptTestModalComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ScriptTestModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
