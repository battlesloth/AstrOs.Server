import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormatModalComponent } from './format-modal.component';

describe('FormatModalComponent', () => {
  let component: FormatModalComponent;
  let fixture: ComponentFixture<FormatModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [FormatModalComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FormatModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
