import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DfPlayerComponent } from './df-player.component';

describe('DfPlayerComponent', () => {
  let component: DfPlayerComponent;
  let fixture: ComponentFixture<DfPlayerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DfPlayerComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DfPlayerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
