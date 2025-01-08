import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScriptRowComponent } from './script-row.component';

describe('ScriptRowComponent', () => {
  let component: ScriptRowComponent;
  let fixture: ComponentFixture<ScriptRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [ScriptRowComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ScriptRowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
