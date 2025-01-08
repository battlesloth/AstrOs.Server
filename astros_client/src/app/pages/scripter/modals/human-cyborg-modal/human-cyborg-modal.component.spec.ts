import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HumanCyborgModalComponent } from './human-cyborg-modal.component';

describe('HumanCyborgModalComponent', () => {
  let component: HumanCyborgModalComponent;
  let fixture: ComponentFixture<HumanCyborgModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [HumanCyborgModalComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HumanCyborgModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
