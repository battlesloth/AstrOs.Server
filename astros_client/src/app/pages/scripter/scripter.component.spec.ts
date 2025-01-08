import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScripterComponent } from './scripter.component';

describe('ScripterComponent', () => {
  let component: ScripterComponent;
  let fixture: ComponentFixture<ScripterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [ScripterComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ScripterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
